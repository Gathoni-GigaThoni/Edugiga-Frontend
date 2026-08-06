// ==================== TRANSPORT MANAGEMENT ====================

// ── Module-level state ────────────────────────────────────────────────────────
let _trnRoutesData  = [];
let _trnRoutePage   = 1;
let _trnRoutePerPage = 10;

window._currentEditRouteId = null;
let _trnRouteFormDirty = false;

// Drag-and-drop state for the Stops builder
let _trnDragSrcIdx = null;

// Migration p4e5f6g7h8i9 converted Bus.id to VARCHAR and backfilled existing
// rows with 'BUS-0007'-style placeholders — these need renaming to the real
// registration plate via PATCH /buses/{id}/plate (renaming isn't a plain
// UPDATE since bus_route has no ON UPDATE CASCADE on the FK).
function isPlaceholderPlate(busId) {
  return /^BUS-\d{4}$/.test(busId || '');
}

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
  await renderSplitView({
    container,
    title: 'Routes',
    moduleKey: 'transport_management',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Transport Management',view:'transport-routes'},
      {label:'Routes'}
    ],
    apiUrl: `${API_BASE}/routes/`,
    col1Label: 'Route Name', col2Label: 'Code',
    col1: r => r.name || '—',
    col2: r => r.route_code || '—',
    rowLabel: r => r.name || '—',
    rowSub:   r => r.route_code || '',
    idKey: 'id',
    detailFields: [
      {label:'Route Name', key:'name'},
      {label:'Route Code', key:'route_code'},
      {label:'Stops',      key:'stops', fmt: v => Array.isArray(v) ? v.length + ' stop(s)' : '—'},
    ],
    renderAdd: el => {
      el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
        <div style="font-size:2rem;margin-bottom:12px">&#128652;</div>
        <p style="font-weight:600;margin-bottom:8px">Add a New Route</p>
        <p style="font-size:13px;margin-bottom:20px">Set up route name, stops and pricing.</p>
        <button class="btn-primary" style="padding:10px 24px" onclick="loadView('transport-routes-add')">+ Add Route</button>
      </div>`;
    },
    onEdit: item => { window._currentEditRouteId = item.id; loadView('transport-routes-edit'); },
  });
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

  // Pricing now lives on a separate sub-resource (/routes/{id}/pricing/), not
  // flat fields on Route — manage it from the route's Edit page.
  const rows = paged.length
    ? paged.map(r => `<tr>
          <td>${_e(r.name)}</td>
          <td class="fin-action-cell">
            <div class="fin-action-wrap">
              <button class="fin-action-btn" onclick="toggleTrnRtDd(event,'${r.id}')">&#8230;</button>
              <div id="trn-rt-dd-${r.id}" class="fin-action-dropdown" style="display:none;">
                <a href="#" onclick="trnOpenRouteEdit('${r.id}');return false;">&#9998; Edit</a>
              </div>
            </div>
          </td>
        </tr>`).join('')
    : '<tr><td colspan="2" class="fin-empty">No routes found. Add one to get started.</td></tr>';

  const tbl = document.getElementById('trn-rt-table');
  if (tbl) tbl.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>NAME</th><th>ACTION</th>
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
    ['Name'],
    _trnRoutesData.map(r => [r.name]),
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

  // Fetch next-id for add mode — preview only, the real id is assigned server-side on POST.
  let routeCode = '';
  if (!isEdit) {
    try {
      const idRes = await apiFetch(`${API_BASE}/routes/next-id`);
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
  const stops = (r.stops || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));

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
      <p class="trn-stops-hint">Add each stop on this route in order. Drag to reorder.</p>
      <div id="trn-stops-list" class="trn-stops-list"></div>
      <button type="button" class="trn-add-stop-btn" onclick="trnAddStop()">+ Add Stop</button>
    </div>

    <div class="trn-form-grid">
      <div class="trn-form-group">
        <label class="trn-form-label">Two-Way Price</label>
        <input type="number" id="trn-rt-two-way" class="fin-search-input trn-form-input" min="0.01" step="0.01"
               value="${_e(r.two_way_price ?? '')}">
        <span class="stu-field-error" id="err-trn-rt-price"></span>
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Morning Only Price</label>
        <input type="number" id="trn-rt-morning" class="fin-search-input trn-form-input" min="0.01" step="0.01"
               value="${_e(r.one_way_morning_price ?? '')}">
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Evening Only Price</label>
        <input type="number" id="trn-rt-evening" class="fin-search-input trn-form-input" min="0.01" step="0.01"
               value="${_e(r.one_way_evening_price ?? '')}">
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Daily Rate</label>
        <input type="number" id="trn-rt-daily" class="fin-search-input trn-form-input" min="0.01" step="0.01"
               value="${_e(r.daily_rate ?? '')}">
      </div>
    </div>

    <div class="trn-form-group">
      <label class="trn-form-label">Transport Pricing (per direction)</label>
      ${isEdit
        ? `<div id="trn-pricing-list" class="trn-stops-list"></div>
           <div style="display:flex;gap:8px;margin-top:8px;">
             <select id="trn-pricing-direction" class="fin-search-input" style="flex:1;">
               <option value="TWO_WAY">Two-way</option>
               <option value="ONE_WAY_MORNING">One-way (Morning)</option>
               <option value="ONE_WAY_EVENING">One-way (Evening)</option>
             </select>
             <input type="number" id="trn-pricing-price" class="fin-search-input" style="flex:1;" min="0.01" step="0.01" placeholder="Price">
             <button type="button" class="trn-add-stop-btn" onclick="trnAddPricing('${r.id}')">+ Add</button>
           </div>`
        : `<p class="trn-stops-hint">Save the route first, then manage per-direction pricing from its Edit page.</p>`}
    </div>

    <div style="display:flex;gap:12px;margin-top:24px;">
      <button class="fin-btn-teal" id="trn-rt-submit-btn" onclick="submitTrnRouteForm(${isEdit ? (route?.id ? `'${route.id}'` : 'null') : 'null'})">
        ${isEdit ? 'Update' : 'Save'}
      </button>
      <button class="fin-btn-cancel" onclick="cancelTrnRouteForm()">Cancel</button>
    </div>
  `;

  // Populate stop rows
  window._trnStops = stops.map(s => s.name || '');
  _renderTrnStopRows();
  if (isEdit && r.id) _loadTrnRoutePricing(r.id);

  // Mark dirty on any change
  body.querySelectorAll('input,textarea,select').forEach(el => {
    el.addEventListener('change', () => { _trnRouteFormDirty = true; });
    el.addEventListener('input',  () => { _trnRouteFormDirty = true; });
  });
}

// ── Stops / Destinations builder ─────────────────────────────────────────────

function _renderTrnStopRows() {
  const list = document.getElementById('trn-stops-list');
  if (!list) return;
  const stops = window._trnStops || [];
  if (!stops.length) { list.innerHTML = ''; return; }

  list.innerHTML = stops.map((name, i) => `
    <div class="trn-stop-row" draggable="true" data-idx="${i}"
         ondragstart="trnStopDragStart(event,${i})"
         ondragover="trnStopDragOver(event)"
         ondrop="trnStopDrop(event,${i})"
         ondragend="trnStopDragEnd(event)">
      <span class="trn-stop-handle" title="Drag to reorder">&#9776;</span>
      <input type="text" class="fin-search-input trn-stop-input" value="${String(name||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}"
             oninput="_trnStopInput(${i},this.value)"
             onblur="_trnStopBlur(${i},this.value)"
             placeholder="Destination name">
      <button type="button" class="trn-stop-remove" onclick="trnRemoveStop(${i})" title="Remove stop">&#x2715;</button>
    </div>
  `).join('');
}

function trnAddStop() {
  window._trnStops = window._trnStops || [];
  window._trnStops.push('');
  _trnRouteFormDirty = true;
  _renderTrnStopRows();
  // Focus the new input
  const rows = document.querySelectorAll('.trn-stop-input');
  if (rows.length) rows[rows.length - 1].focus();
}

function trnRemoveStop(idx) {
  window._trnStops = window._trnStops || [];
  window._trnStops.splice(idx, 1);
  _trnRouteFormDirty = true;
  _renderTrnStopRows();
}

function _trnStopInput(idx, val) {
  window._trnStops = window._trnStops || [];
  window._trnStops[idx] = val;
  _trnRouteFormDirty = true;
}

// Auto-remove empty stop rows on blur (smoother than blocking submission on them)
function _trnStopBlur(idx, val) {
  if (!val.trim()) trnRemoveStop(idx);
}

// ── HTML5 drag-and-drop for stop reordering ───────────────────────────────────
function trnStopDragStart(event, idx) {
  _trnDragSrcIdx = idx;
  event.dataTransfer.effectAllowed = 'move';
  event.currentTarget.classList.add('trn-stop-dragging');
}
function trnStopDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}
function trnStopDrop(event, targetIdx) {
  event.preventDefault();
  if (_trnDragSrcIdx === null || _trnDragSrcIdx === targetIdx) return;
  const stops = window._trnStops || [];
  const [moved] = stops.splice(_trnDragSrcIdx, 1);
  stops.splice(targetIdx, 0, moved);
  window._trnStops = stops;
  _trnDragSrcIdx = null;
  _trnRouteFormDirty = true;
  _renderTrnStopRows();
}
function trnStopDragEnd(event) {
  event.currentTarget.classList.remove('trn-stop-dragging');
  _trnDragSrcIdx = null;
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

  const twoWay  = document.getElementById('trn-rt-two-way')?.value;
  const morning = document.getElementById('trn-rt-morning')?.value;
  const evening = document.getElementById('trn-rt-evening')?.value;
  const daily   = document.getElementById('trn-rt-daily')?.value;

  const prices = [twoWay, morning, evening, daily].map(v => v !== '' && v !== undefined ? parseFloat(v) : null);
  // Backend now rejects 0 (gt=0, was ge=0) — a free route made no accounting
  // sense — so a provided price of exactly 0 is invalid, not just negatives.
  const invalidPrice = prices.some(p => p !== null && !isNaN(p) && p <= 0);
  if (invalidPrice) {
    if (errPrice) errPrice.textContent = 'Prices must be greater than 0.';
    return;
  }
  const hasAtLeastOnePrice = prices.some(p => p !== null && !isNaN(p));
  if (!hasAtLeastOnePrice) {
    if (errPrice) errPrice.textContent = 'At least one price field must be provided.';
    return;
  }

  // Collect stops — filter out any empty rows left over
  const stops = (window._trnStops || [])
    .map((s, i) => ({ order: i + 1, name: (s || '').trim() }))
    .filter(s => s.name);

  const isEdit = !!routeId;
  const payload = {
    name,
    stops,
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
  } else if (res) {
    // 409s (duplicate name, still-referenced FK, etc) previously bubbled as raw
    // 500s that the browser reported as CORS errors — Starlette's
    // ServerErrorMiddleware sits outside CORSMiddleware, so a raw 500 never got
    // Access-Control-Allow-Origin. The backend now returns an actionable 409
    // with a verbatim detail string; parseApiError already surfaces it as-is.
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

// ── Transport Pricing (per-route sub-resource) ───────────────────────────────
// Distinct from the flat two_way_price/one_way_morning_price/etc fields on
// Route itself — this is the newer /routes/{id}/pricing/ sub-resource that
// student registration's transport_pricing_id references (js/students.js).
let _trnPricingData = [];
const _TRN_DIRECTION_LABELS = { TWO_WAY: 'Two-way', ONE_WAY_MORNING: 'One-way (Morning)', ONE_WAY_EVENING: 'One-way (Evening)' };

async function _loadTrnRoutePricing(routeId) {
  const list = document.getElementById('trn-pricing-list');
  if (list) list.innerHTML = '<p class="fin-loading">Loading pricing&#8230;</p>';
  const res = await apiFetch(`${API_BASE}/routes/${routeId}/pricing/`);
  _trnPricingData = (res && res.ok) ? _toArray(await res.json()) : [];
  _renderTrnPricingList(routeId);
}

function _renderTrnPricingList(routeId) {
  const list = document.getElementById('trn-pricing-list');
  if (!list) return;
  if (!_trnPricingData.length) { list.innerHTML = '<p style="color:#888;font-size:0.85rem;">No pricing rows yet.</p>'; return; }
  list.innerHTML = _trnPricingData.map(p => `
    <div class="trn-stop-row">
      <input type="text" class="fin-search-input trn-stop-input" value="${_TRN_DIRECTION_LABELS[p.direction] || p.direction} — KES ${parseFloat(p.price).toLocaleString('en-KE',{minimumFractionDigits:2})}" disabled>
      <button type="button" class="trn-stop-remove" onclick="trnDeletePricing('${routeId}',${p.id})" title="Delete">&#x2715;</button>
    </div>
  `).join('');
}

async function trnAddPricing(routeId) {
  const direction = document.getElementById('trn-pricing-direction')?.value;
  const priceVal = document.getElementById('trn-pricing-price')?.value;
  const price = parseFloat(priceVal);
  if (!direction || !(price > 0)) { showToast('Direction and a price greater than 0 are required.', 'error'); return; }
  const res = await apiFetch(`${API_BASE}/routes/${routeId}/pricing/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ direction, price }),
  });
  if (res && res.ok) {
    const priceInput = document.getElementById('trn-pricing-price');
    if (priceInput) priceInput.value = '';
    await _loadTrnRoutePricing(routeId);
  } else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

async function trnDeletePricing(routeId, pricingId) {
  if (!confirm('Delete this pricing row?')) return;
  const res = await apiFetch(`${API_BASE}/routes/${routeId}/pricing/${pricingId}`, { method: 'DELETE' });
  if (res && res.ok) await _loadTrnRoutePricing(routeId);
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

function cancelTrnRouteForm() {
  if (_trnRouteFormDirty && !confirm('You have unsaved changes. Discard them?')) return;
  _trnRouteFormDirty = false;
  window._currentEditRouteId = null;
  loadView('transport-routes');
}

// ==================== BUSES (VEHICLES) ====================
// Bus.id is the vehicle registration plate (string), not a generated int PK —
// it's a required text field on create and read-only on edit.

let _trnBusesData = [], _trnBusPage = 1, _trnBusPerPage = 10;
window._currentEditBusId = null;
let _trnBusFormDirty = false;

async function loadBusesView(container) {
  const res = await apiFetch(`${API_BASE}/buses/`);
  const buses = (res && res.ok) ? _toArray(await res.json()) : [];
  const placeholderCount = buses.filter(b => isPlaceholderPlate(b.id)).length;
  const banner = placeholderCount ? `
    <div style="background:var(--gold-100,#FAF2D3);border-left:3px solid var(--gold-500,#C9A227);padding:10px 14px;border-radius:6px;margin-bottom:12px;font-size:0.85rem;color:#6b5400;">
      ${placeholderCount} bus${placeholderCount===1?'':'es'} still carry placeholder plates from the migration. Rename them to the real registration plates.
    </div>` : '';
  container.innerHTML = banner + '<div id="trn-buses-split"></div>';
  const splitContainer = document.getElementById('trn-buses-split');
  await renderSplitView({
    container: splitContainer,
    title: 'Vehicles',
    moduleKey: 'transport_management',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Transport Management',view:'transport-routes'},
      {label:'Vehicles'}
    ],
    apiUrl: `${API_BASE}/buses/`,
    col1Label: 'Plate / Name', col2Label: 'Driver',
    col1: b => b.name || b.id || '—',
    col2: b => b.driver_name || '—',
    rowLabel: b => b.name || b.id || '—',
    rowSub:   b => b.driver_name || '',
    idKey: 'id',
    detailFields: [
      {label:'Plate / ID',  key:'id'},
      {label:'Name',        key:'name'},
      {label:'Capacity',    key:'capacity'},
      {label:'Driver',      key:'driver_name'},
      {label:'Bus Minder',  key:'bus_minder_name'},
    ],
    detailActions: bus => isPlaceholderPlate(bus.id)
      ? `<button class="fin-btn-teal" style="background:var(--gold-500,#C9A227);" onclick="_trnOpenRenamePlateModal('${bus.id}')">Rename plate</button>`
      : '',
    renderAdd: el => {
      el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
        <div style="font-size:2rem;margin-bottom:12px">&#128652;</div>
        <p style="font-weight:600;margin-bottom:8px">Add a Vehicle</p>
        <p style="font-size:13px;margin-bottom:20px">Register a new bus or vehicle.</p>
        <button class="btn-primary" style="padding:10px 24px" onclick="loadView('transport-vehicles-add')">+ Add Vehicle</button>
      </div>`;
    },
    onEdit: item => { window._currentEditBusId = item.id; loadView('transport-vehicles-edit'); },
  });
}

// Rename modal — only reachable from the "Rename plate" CTA, which only
// renders on ^BUS-\d{4}$ placeholder ids. Hand-built inline modal, matching
// the existing pattern in finance.js (no shared .modal class in this app).
function _trnOpenRenamePlateModal(busId) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;';
  wrap.innerHTML = `
    <div style="background:#fff;border-radius:8px;padding:24px;max-width:420px;width:90%;">
      <h3 style="margin:0 0 12px;font-size:1.05rem;">Rename Plate</h3>
      <p style="font-size:0.85rem;color:#666;margin-bottom:12px;">Enter the plate as it appears on the registration, e.g. KAA 123A.</p>
      <input type="text" id="trn-rename-plate-input" class="fin-search-input" style="width:100%;" minlength="2" maxlength="20" placeholder="e.g. KAA 123A">
      <div id="trn-rename-plate-err" style="color:var(--coral-500,#D94040);font-size:0.82rem;margin-top:8px;"></div>
      <div style="display:flex;gap:10px;margin-top:20px;">
        <button class="fin-btn-teal" onclick="_trnSubmitRenamePlate('${busId}', this)">Rename</button>
        <button class="fin-btn-cancel" onclick="this.closest('div[style*=fixed]').remove()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById('trn-rename-plate-input')?.focus();
}

async function _trnSubmitRenamePlate(busId, btn) {
  const input = document.getElementById('trn-rename-plate-input');
  const errEl = document.getElementById('trn-rename-plate-err');
  const newId = (input?.value || '').trim();
  if (errEl) errEl.textContent = '';
  if (newId.length < 2 || newId.length > 20) {
    if (errEl) errEl.textContent = 'Plate must be 2-20 characters.';
    return;
  }
  const res = await apiFetch(`${API_BASE}/buses/${encodeURIComponent(busId)}/plate`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_id: newId }),
  });
  if (res && res.ok) {
    btn.closest('div[style*="fixed"]')?.remove();
    showToast('Plate renamed.', 'success');
    loadView('transport-vehicles');
  } else if (res) {
    // 409 (duplicate plate) renders inline in the modal, not a toast — this
    // is a data-entry retry, not a workflow error worth losing the modal over.
    if (errEl) errEl.textContent = await parseApiError(res);
  }
}

async function _fetchTrnBuses() {
  const res = await apiFetch(`${API_BASE}/buses/`);
  if (res && res.ok) {
    const raw = await res.json();
    _trnBusesData = Array.isArray(raw) ? raw : (raw.data || raw.results || raw.items || []);
  } else {
    _trnBusesData = [];
    showToast('Could not load buses.', 'error');
  }
  _trnBusPage = 1;
  _renderTrnBusesTable();
}

function _renderTrnBusesTable() {
  const _e = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const totalEl = document.getElementById('trn-bus-total');
  if (totalEl) totalEl.textContent = _trnBusesData.length;

  const start = (_trnBusPage - 1) * _trnBusPerPage;
  const paged = _trnBusesData.slice(start, start + _trnBusPerPage);
  const pages = Math.max(1, Math.ceil(_trnBusesData.length / _trnBusPerPage));

  const rows = paged.length
    ? paged.map(b => `<tr>
          <td>${_e(b.id)}</td>
          <td>${_e(b.name || '-')}</td>
          <td>${_e(b.capacity)}</td>
          <td>${_e(b.driver_name)}</td>
          <td>${_e(b.bus_minder_name || '-')}</td>
          <td class="fin-action-cell">
            <div class="fin-action-wrap">
              <button class="fin-action-btn" onclick="toggleTrnBusDd(event,'${_e(b.id)}')">&#8230;</button>
              <div id="trn-bus-dd-${_e(b.id)}" class="fin-action-dropdown" style="display:none;">
                <a href="#" onclick="trnOpenBusEdit('${_e(b.id)}');return false;">&#9998; Edit</a>
                <a href="#" onclick="trnDeleteBus('${_e(b.id)}');return false;">&#128465; Delete</a>
              </div>
            </div>
          </td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="fin-empty">No vehicles found. Add one to get started.</td></tr>';

  const tbl = document.getElementById('trn-bus-table');
  if (tbl) tbl.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>PLATE (ID)</th><th>NAME</th><th>CAPACITY</th><th>DRIVER</th><th>BUS MINDER</th><th>ACTION</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  _mkTrnPagination('trn-bus-pagination', _trnBusPage, pages, 'trnBusGoPage');
}

function toggleTrnBusDd(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="trn-bus-dd-"]').forEach(d => { if (d.id !== `trn-bus-dd-${id}`) d.style.display = 'none'; });
  const dd = document.getElementById(`trn-bus-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="trn-bus-dd-"]').forEach(d => d.style.display = 'none');
});

function trnOpenBusEdit(id) {
  window._currentEditBusId = id;
  loadView('transport-vehicles-edit');
}

async function trnDeleteBus(id) {
  if (!confirm(`Delete bus "${id}"? This cannot be undone.`)) return;
  const res = await apiFetch(`${API_BASE}/buses/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res && res.ok) { showToast('Bus deleted.', 'success'); await _fetchTrnBuses(); }
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

function changeTrnBusPerPage(v) { _trnBusPerPage = parseInt(v); _trnBusPage = 1; _renderTrnBusesTable(); }
function trnBusGoPage(p) { _trnBusPage = p; _renderTrnBusesTable(); }

// ==================== ADD / EDIT BUS FORM ====================

async function loadBusFormView(container, busId) {
  const isEdit = !!busId;
  _trnBusFormDirty = false;

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${isEdit ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Transport Management &rsaquo; Utilities &rsaquo; Vehicles &rsaquo; ${isEdit ? 'Edit' : 'Add'}</div>
      </div>
      <div id="trn-bus-form-body" style="max-width:680px;background:#fff;border-radius:8px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.07);">
        <p class="fin-loading">Loading&#8230;</p>
      </div>
    </div>
  `;

  let bus = null;
  if (isEdit) {
    const res = await apiFetch(`${API_BASE}/buses/${encodeURIComponent(busId)}`);
    if (!res || !res.ok) { showToast('Could not load bus.', 'error'); return; }
    bus = await res.json();
  }
  _renderTrnBusForm(container, bus, isEdit);
}

function _renderTrnBusForm(container, bus, isEdit) {
  const _e = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const b = bus || {};

  const body = document.getElementById('trn-bus-form-body');
  if (!body) return;

  body.innerHTML = `
    <div class="trn-form-group">
      <label class="trn-form-label">Registration Plate (ID) <span style="color:#e74c3c">*</span></label>
      ${isEdit
        ? `<input type="text" class="fin-search-input trn-form-input" value="${_e(b.id)}" readonly style="background:#f5f5f5;color:#666;cursor:not-allowed;">`
        : `<input type="text" id="trn-bus-id" class="fin-search-input trn-form-input" placeholder="e.g. KAA 123A" value="${_e(b.id || '')}">`}
      <span class="stu-field-error" id="err-trn-bus-id"></span>
    </div>

    <div class="trn-form-group">
      <label class="trn-form-label">Name</label>
      <input type="text" id="trn-bus-name" class="fin-search-input trn-form-input" value="${_e(b.name || '')}" placeholder="Optional label">
    </div>

    <div class="trn-form-grid">
      <div class="trn-form-group">
        <label class="trn-form-label">Capacity <span style="color:#e74c3c">*</span></label>
        <input type="number" id="trn-bus-capacity" class="fin-search-input trn-form-input" min="1" value="${_e(b.capacity ?? '')}">
        <span class="stu-field-error" id="err-trn-bus-capacity"></span>
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Driver Name <span style="color:#e74c3c">*</span></label>
        <input type="text" id="trn-bus-driver" class="fin-search-input trn-form-input" value="${_e(b.driver_name || '')}">
        <span class="stu-field-error" id="err-trn-bus-driver"></span>
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Bus Minder Name</label>
        <input type="text" id="trn-bus-minder" class="fin-search-input trn-form-input" value="${_e(b.bus_minder_name || '')}">
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Fuel Capacity</label>
        <input type="number" id="trn-bus-fuel" class="fin-search-input trn-form-input" min="0" step="0.01" value="${_e(b.fuel_capacity ?? '')}">
      </div>
    </div>

    <div class="trn-form-group">
      <label class="trn-form-label">Assigned Routes</label>
      ${isEdit
        ? `<div id="trn-bus-routes-list" class="trn-stops-list"></div>
           <div style="display:flex;gap:8px;margin-top:8px;">
             <select id="trn-bus-route-pick" class="fin-search-input" style="flex:1;"><option value="">Loading routes&#8230;</option></select>
             <button type="button" class="trn-add-stop-btn" onclick="trnAssignBusRoute('${b.id}')">+ Assign</button>
           </div>`
        : `<p class="trn-stops-hint">Save the bus first, then assign routes from its Edit page.</p>`}
    </div>

    <div style="display:flex;gap:12px;margin-top:24px;">
      <button class="fin-btn-teal" id="trn-bus-submit-btn" onclick="submitTrnBusForm(${isEdit ? `'${b.id}'` : 'null'})">
        ${isEdit ? 'Update' : 'Save'}
      </button>
      <button class="fin-btn-cancel" onclick="cancelTrnBusForm()">Cancel</button>
    </div>
  `;

  if (isEdit) _loadTrnBusRoutes(b.id);

  body.querySelectorAll('input,textarea,select').forEach(el => {
    el.addEventListener('change', () => { _trnBusFormDirty = true; });
    el.addEventListener('input',  () => { _trnBusFormDirty = true; });
  });
}

// ── Bus ↔ Route assignment ───────────────────────────────────────────────────
let _trnBusAssignedRoutes = [];

async function _loadTrnBusRoutes(busId) {
  const list = document.getElementById('trn-bus-routes-list');
  if (list) list.innerHTML = '<p class="fin-loading">Loading routes&#8230;</p>';
  const res = await apiFetch(`${API_BASE}/buses/${encodeURIComponent(busId)}`);
  const bus = (res && res.ok) ? await res.json() : null;
  _trnBusAssignedRoutes = bus?.routes || [];
  _renderTrnBusRoutesList(busId);

  const allRes = await apiFetch(`${API_BASE}/routes/`);
  const allRoutes = (allRes && allRes.ok) ? await allRes.json() : [];
  const assignedIds = new Set(_trnBusAssignedRoutes.map(r => String(r.id)));
  const pickEl = document.getElementById('trn-bus-route-pick');
  if (pickEl) {
    const available = (Array.isArray(allRoutes) ? allRoutes : []).filter(r => !assignedIds.has(String(r.id)));
    pickEl.innerHTML = available.length
      ? `<option value="">Please Select</option>${available.map(r => `<option value="${r.id}">${String(r.name||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</option>`).join('')}`
      : '<option value="">No more routes to assign</option>';
  }
}

function _renderTrnBusRoutesList(busId) {
  const list = document.getElementById('trn-bus-routes-list');
  if (!list) return;
  if (!_trnBusAssignedRoutes.length) { list.innerHTML = '<p style="color:#888;font-size:0.85rem;">No routes assigned yet.</p>'; return; }
  list.innerHTML = _trnBusAssignedRoutes.map(r => `
    <div class="trn-stop-row">
      <input type="text" class="fin-search-input trn-stop-input" value="${String(r.name||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}" disabled>
      <button type="button" class="trn-stop-remove" onclick="trnUnassignBusRoute('${busId}','${r.id}')" title="Unassign">&#x2715;</button>
    </div>
  `).join('');
}

async function trnAssignBusRoute(busId) {
  const routeId = document.getElementById('trn-bus-route-pick')?.value;
  if (!routeId) return;
  const res = await apiFetch(`${API_BASE}/buses/${encodeURIComponent(busId)}/routes/${routeId}`, { method: 'POST' });
  if (res && res.ok) await _loadTrnBusRoutes(busId);
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

async function trnUnassignBusRoute(busId, routeId) {
  const res = await apiFetch(`${API_BASE}/buses/${encodeURIComponent(busId)}/routes/${routeId}`, { method: 'DELETE' });
  if (res && res.ok) await _loadTrnBusRoutes(busId);
  else if (res) showToast('Error: ' + await parseApiError(res), 'error');
}

async function submitTrnBusForm(busId) {
  const isEdit = !!busId;
  const errId = document.getElementById('err-trn-bus-id');
  const errCapacity = document.getElementById('err-trn-bus-capacity');
  const errDriver = document.getElementById('err-trn-bus-driver');
  if (errId) errId.textContent = '';
  if (errCapacity) errCapacity.textContent = '';
  if (errDriver) errDriver.textContent = '';

  const plate = isEdit ? busId : (document.getElementById('trn-bus-id')?.value || '').trim();
  const capacity = document.getElementById('trn-bus-capacity')?.value;
  const driverName = (document.getElementById('trn-bus-driver')?.value || '').trim();

  let valid = true;
  if (!isEdit && !plate) { if (errId) errId.textContent = 'Registration Plate is required.'; valid = false; }
  if (!capacity || parseInt(capacity, 10) < 1) { if (errCapacity) errCapacity.textContent = 'Capacity is required.'; valid = false; }
  if (!driverName) { if (errDriver) errDriver.textContent = 'Driver Name is required.'; valid = false; }
  if (!valid) return;

  const fuel = document.getElementById('trn-bus-fuel')?.value;
  const payload = {
    name: document.getElementById('trn-bus-name')?.value.trim() || null,
    capacity: parseInt(capacity, 10),
    driver_name: driverName,
    bus_minder_name: document.getElementById('trn-bus-minder')?.value.trim() || null,
    fuel_capacity: fuel !== '' && fuel !== undefined ? parseFloat(fuel) : null,
  };
  if (!isEdit) payload.id = plate;

  const url    = isEdit ? `${API_BASE}/buses/${encodeURIComponent(busId)}` : `${API_BASE}/buses/`;
  const method = isEdit ? 'PUT' : 'POST';
  const btn    = document.getElementById('trn-bus-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (btn) { btn.disabled = false; btn.textContent = isEdit ? 'Update' : 'Save'; }

  if (res && res.ok) {
    _trnBusFormDirty = false;
    showToast(isEdit ? 'Bus updated successfully.' : 'Bus created successfully.', 'success');
    window._currentEditBusId = null;
    loadView('transport-vehicles');
  } else if (res) {
    // Duplicate name is now allowed (UNIQUE constraint dropped — buses are
    // keyed by plate, not nickname); a 409 here means a genuine conflict
    // (e.g. duplicate plate). Surface parseApiError's verbatim detail rather
    // than the raw JSON this used to hand-parse.
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

function cancelTrnBusForm() {
  if (_trnBusFormDirty && !confirm('You have unsaved changes. Discard them?')) return;
  _trnBusFormDirty = false;
  window._currentEditBusId = null;
  loadView('transport-vehicles');
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

let _trnSprData = [], _trnSprPage = 1, _trnSprPerPage = 10, _trnSprRoutes = [], _trnSprRouteId = '', _trnSprTermId = '';

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
          <label style="font-size:0.88rem;color:#555;margin-right:6px;">Term:</label>
          <select id="trn-spr-term-sel" class="fin-search-input" onchange="onTrnSprTermChange(this.value)"
                  style="min-width:160px;margin-right:10px;">
            <option value="">— Select Term —</option>
          </select>
          <label style="font-size:0.88rem;color:#555;margin-right:6px;">Route:</label>
          <select id="trn-spr-route-sel" class="fin-search-input" onchange="onTrnSprRouteChange(this.value)"
                  style="min-width:200px;">
            <option value="">— All Routes —</option>
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
  await populateTermDropdown('trn-spr-term-sel');

  _trnSprData = [];
  _trnSprPage = 1;
  _renderTrnSprTable();
}

// term_id is a required query param on GET /student-routes/report (confirmed
// live via openapi.json) — omitting it is what caused the 422. route_id is
// optional and filters within the term; response rows are StudentRouteReportRow
// (student_id, student_name, student_code, route_id, route_name, direction,
// use_daily_rate, charge_amount) — confirmed live, no class/journey_type/
// time_of_day fields exist on it at all.
async function _trnSprFetchReport() {
  if (!_trnSprTermId) { _trnSprData = []; _trnSprPage = 1; _renderTrnSprTable(); return; }
  renderSkeletonRows('trn-spr-table', 5);
  const params = new URLSearchParams({ term_id: _trnSprTermId });
  if (_trnSprRouteId) params.set('route_id', _trnSprRouteId);
  const res = await apiFetch(`${API_BASE}/student-routes/report?${params.toString()}`);
  if (res && res.ok) {
    const raw = await res.json();
    _trnSprData = Array.isArray(raw) ? raw : (raw.data || raw.results || []);
  } else {
    _trnSprData = [];
    if (res) showToast('Error: ' + await parseApiError(res), 'error');
  }
  _trnSprPage = 1;
  _renderTrnSprTable();
}

async function onTrnSprTermChange(termId) {
  _trnSprTermId = termId;
  await _trnSprFetchReport();
}

async function onTrnSprRouteChange(routeId) {
  _trnSprRouteId = routeId;
  await _trnSprFetchReport();
}

function _renderTrnSprTable() {
  const totalEl = document.getElementById('trn-spr-total');
  if (totalEl) totalEl.textContent = _trnSprData.length;

  const start = (_trnSprPage - 1) * _trnSprPerPage;
  const paged = _trnSprData.slice(start, start + _trnSprPerPage);
  const pages = Math.max(1, Math.ceil(_trnSprData.length / _trnSprPerPage));
  const _e = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const rows = paged.length
    ? paged.map(s => `<tr>
          <td>${_e(s.student_code || '')}</td>
          <td>${_e(s.student_name || '')}</td>
          <td>${_e(s.route_name || '')}</td>
          <td>${_e(_TRN_DIRECTION_LABELS[s.direction] || s.direction || '—')}</td>
          <td>${_e(s.use_daily_rate ? 'Daily' : 'Termly')}</td>
          <td>KES ${_e(parseFloat(s.charge_amount || 0).toLocaleString('en-KE',{minimumFractionDigits:2}))}</td>
        </tr>`).join('')
    : `<tr><td colspan="6" class="fin-empty">${_trnSprTermId ? 'No students found.' : 'Select a term to view students.'}</td></tr>`;

  const tbl = document.getElementById('trn-spr-table');
  if (tbl) tbl.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th>STUDENT ID</th><th>STUDENT NAME</th><th>ROUTE</th><th>DIRECTION</th><th>RATE TYPE</th><th>CHARGE AMOUNT</th>
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
    ['Student ID', 'Student Name', 'Route', 'Direction', 'Rate Type', 'Charge Amount'],
    _trnSprData.map(s => [
      s.student_code || '', s.student_name || '', s.route_name || '',
      _TRN_DIRECTION_LABELS[s.direction] || s.direction || '',
      s.use_daily_rate ? 'Daily' : 'Termly',
      parseFloat(s.charge_amount || 0).toFixed(2),
    ]),
    'student-report-per-route.csv'
  );
}

// ==================== BUS SCHEDULES (§BB manifest layer) ====================
// A per-day, per-timing manifest on top of the static transport rules —
// StudentRoute/TransportPricing answer "who is supposed to ride"; this
// answers "who is actually on Bus X this Tuesday morning". Nothing here is
// a billing driver: daily-adding a rider never creates a fee charge (§1.3).

const _BS_API = `${API_BASE}/bus-schedules`;
let _bsFilters = { service_date: '', bus_id: '', timing: '', status: '' };
let _bsRidersCache = {};     // schedule id -> rider[]
let _bsGuardiansCache = {};  // student id -> ParentInfoRead[] (also shared with residence plans, §6)
let _bsStudentsCache = null;
let _bsContainer = null;
let _bsActiveScheduleId = null; // guards a slow riders fetch from clobbering a newer selection

function _bsEsc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// One gate for locked — suppresses Edit, Delete, rider add and rider remove (§8.1).
function isLocked(manifest) { return !!manifest && manifest.status === 'locked'; }

function _bsStatusPill(status) {
  const map = {
    draft:     `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:#666;background:#eee;">Draft</span>`,
    published: `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:#fff;background:var(--navy-700,#1B3057);">Published</span>`,
    locked:    `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;color:#7a6110;background:var(--gold-100,#fbe8b0);">&#128274; Locked</span>`,
  };
  return map[status] || map.draft;
}

function _trnRouteName(routeId) {
  const r = (_trnRoutesData || []).find(x => String(x.id) === String(routeId));
  return r ? (r.name || routeId) : routeId;
}

// ── List ─────────────────────────────────────────────────────────────────

function _bsBuildUrl() {
  const p = new URLSearchParams();
  if (_bsFilters.service_date) p.set('service_date', _bsFilters.service_date);
  if (_bsFilters.bus_id)       p.set('bus_id', _bsFilters.bus_id);
  if (_bsFilters.timing)       p.set('timing', _bsFilters.timing);
  if (_bsFilters.status)       p.set('status', _bsFilters.status);
  const qs = p.toString();
  return `${_BS_API}/${qs ? '?' + qs : ''}`;
}

async function loadTrnBusSchedulesView(container) {
  _bsContainer = container;
  const preselectId = window._bsOpenId ?? null;
  window._bsOpenId = null;
  if (preselectId) {
    // Deep-linked from Casual Bus's "View Manifest" cross-link — the target
    // manifest's date is unknown up front, so clear filters rather than risk
    // it falling outside whatever date/status filter was left from last visit.
    _bsFilters = { service_date: '', bus_id: '', timing: '', status: '' };
  } else if (!_bsFilters.service_date) {
    _bsFilters.service_date = new Date().toISOString().split('T')[0];
  }
  await Promise.all([_fetchTrnBuses(), _fetchTrnRoutes()]);
  await _bsRenderSplit(preselectId);
}

// Deep-link handoff (mirrors js/journal-entries.js's _jeOpenDetail) — lets
// Casual Bus Assignment's "View Manifest" cross-link jump straight to a
// specific manifest's detail pane instead of the bare list.
function _bsOpenDetail(id) {
  window._bsOpenId = id;
  loadView('transport-bus-schedules');
}

async function _bsRenderSplit(preselectId) {
  if (!_bsContainer) return;
  await renderSplitView({
    container: _bsContainer,
    moduleKey: 'transport_management',
    title: 'Bus Schedules',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Transport Management',view:'transport-bus-schedules'},
      {label:'Bus Schedules'}
    ],
    apiUrl: _bsBuildUrl(),
    preselectId,
    col1Label: 'Manifest', col2Label: 'Status',
    col1: s => `${_bsEsc(s.bus_plate || s.bus_id)} &middot; ${(s.timing||'').toUpperCase()}`,
    col2: s => _bsStatusPill(s.status),
    rowLabel: s => `${_bsEsc(s.bus_plate || s.bus_id)} &middot; ${(s.timing||'').toUpperCase()}`,
    rowSub: s => `${s.service_date} &middot; ${(s.route_ids||[]).length} route${(s.route_ids||[]).length===1?'':'s'} &middot; ${s.rider_count ?? 0}/${s.max_capacity} riders`,
    idKey: 'id',
    detailFields: [
      {label:'Service Date', key:'service_date'},
      {label:'Timing',       key:'timing', fmt:v=>(v||'').toUpperCase()},
      {label:'Bus',          key:'bus_plate', fmt:(v,item)=>_bsEsc(v || item.bus_id)},
      {label:'Max Capacity', key:'max_capacity'},
      {label:'Riders',       key:'rider_count', fmt:(v,item)=>`${v ?? 0}/${item.max_capacity}`},
      {label:'Routes',       key:'route_ids', fmt: v => (v&&v.length) ? `<ol style="margin:0;padding-left:18px;">${v.map(rid=>`<li>${_bsEsc(_trnRouteName(rid))}</li>`).join('')}</ol>` : '&mdash;'},
      {label:'Notes',        key:'notes', fmt:v=>v?_bsEsc(v):'&mdash;'},
    ],
    renderAdd: _bsRenderAddForm,
    canEdit: item => !isLocked(item),
    renderEdit: _bsRenderEditForm,
    detailActions: _bsDetailActions,
  });
  _bsInjectFilterBar();
}

// Filter row + "Generate for date" — injected under the split-left header
// since renderSplitView's shared config has no dedicated filter-bar slot.
function _bsInjectFilterBar() {
  const root = _bsContainer;
  if (!root) return;
  const header = root.querySelector('.split-left-header');
  if (!header) return;
  const busOptions = (_trnBusesData||[]).map(b =>
    `<option value="${_bsEsc(b.id)}" ${_bsFilters.bus_id===b.id?'selected':''}>${_bsEsc(b.id)}</option>`).join('');
  const bar = document.createElement('div');
  bar.id = 'bs-filter-bar';
  bar.style = 'padding:10px 14px;border-bottom:1px solid var(--grey-100,#eee);';
  bar.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
      <div>
        <label class="trn-form-label" style="font-size:0.72rem;">Service Date</label>
        <input type="date" id="bs-f-date" class="fin-search-input" style="padding:6px 8px;" value="${_bsFilters.service_date}" onchange="_bsFilterDateChange(this.value)">
      </div>
      <div>
        <label class="trn-form-label" style="font-size:0.72rem;">Bus</label>
        <select id="bs-f-bus" class="fin-search-input" style="padding:6px 8px;" onchange="_bsFilterBusChange(this.value)">
          <option value="">All</option>${busOptions}
        </select>
      </div>
      <div>
        <label class="trn-form-label" style="font-size:0.72rem;">Timing</label>
        <div style="display:flex;gap:4px;">
          ${['', 'am', 'pm'].map(t => `<button type="button" class="${_bsFilters.timing===t?'fin-btn-teal':'fin-btn-outline'}" style="padding:5px 10px;font-size:0.78rem;" onclick="_bsFilterTimingChange('${t}')">${t===''?'All':t.toUpperCase()}</button>`).join('')}
        </div>
      </div>
      <div>
        <label class="trn-form-label" style="font-size:0.72rem;">Status</label>
        <select id="bs-f-status" class="fin-search-input" style="padding:6px 8px;" onchange="_bsFilterStatusChange(this.value)">
          <option value="" ${!_bsFilters.status?'selected':''}>All</option>
          <option value="draft" ${_bsFilters.status==='draft'?'selected':''}>Draft</option>
          <option value="published" ${_bsFilters.status==='published'?'selected':''}>Published</option>
          <option value="locked" ${_bsFilters.status==='locked'?'selected':''}>Locked</option>
        </select>
      </div>
      <button class="fin-btn-teal" style="margin-left:auto;padding:7px 14px;" onclick="_bsOpenGenerateModal()">Generate for date</button>
    </div>`;
  header.insertAdjacentElement('afterend', bar);
}

function _bsFilterDateChange(v)   { _bsFilters.service_date = v; _bsRenderSplit(); }
function _bsFilterBusChange(v)    { _bsFilters.bus_id = v; _bsRenderSplit(); }
function _bsFilterStatusChange(v) { _bsFilters.status = v; _bsRenderSplit(); }
function _bsFilterTimingChange(v) { _bsFilters.timing = v; _bsRenderSplit(); }

// ── Ordered route picker — shared by the Add and Edit forms ────────────────
// Mirrors the Routes screen's stops drag-reorder builder (trnAddStop et al.)
// but picks from existing routes instead of free-text destination names.

let _bsRouteDragSrcIdx = null;

function _bsRenderFormRoutesList(targetId) {
  const list = document.getElementById(targetId);
  if (!list) return;
  const routes = window._bsFormRoutes || [];
  list.innerHTML = routes.length ? routes.map((rid, i) => `
    <div class="trn-stop-row" draggable="true" data-idx="${i}"
         ondragstart="_bsRouteDragStart(event,${i})"
         ondragover="_bsRouteDragOver(event)"
         ondrop="_bsRouteDrop(event,${i},'${targetId}')"
         ondragend="_bsRouteDragEnd(event)">
      <span class="trn-stop-handle" title="Drag to reorder">&#9776;</span>
      <span style="flex:1;padding:6px 8px;">${i+1}. ${_bsEsc(_trnRouteName(rid))}</span>
      <button type="button" class="trn-stop-remove" onclick="_bsRemoveFormRoute(${i},'${targetId}')" title="Remove">&#x2715;</button>
    </div>`).join('') : `<p style="color:#999;font-size:0.85rem;padding:6px 0;">No routes added yet.</p>`;
}

function _bsRouteDragStart(e, idx) {
  _bsRouteDragSrcIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('trn-stop-dragging');
}
function _bsRouteDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function _bsRouteDrop(e, targetIdx, targetId) {
  e.preventDefault();
  if (_bsRouteDragSrcIdx === null || _bsRouteDragSrcIdx === targetIdx) return;
  const routes = window._bsFormRoutes || [];
  const [moved] = routes.splice(_bsRouteDragSrcIdx, 1);
  routes.splice(targetIdx, 0, moved);
  window._bsFormRoutes = routes;
  _bsRouteDragSrcIdx = null;
  _bsRenderFormRoutesList(targetId);
}
function _bsRouteDragEnd(e) { e.currentTarget.classList.remove('trn-stop-dragging'); _bsRouteDragSrcIdx = null; }

function _bsAddRouteToForm(targetId) {
  const pickId = targetId === 'bs-edit-routes-list' ? 'bs-edit-route-pick' : 'bs-add-route-pick';
  const pick = document.getElementById(pickId);
  if (!pick || !pick.value) return;
  window._bsFormRoutes = window._bsFormRoutes || [];
  if (!window._bsFormRoutes.includes(pick.value)) window._bsFormRoutes.push(pick.value);
  _bsRenderFormRoutesList(targetId);
}
function _bsRemoveFormRoute(idx, targetId) {
  (window._bsFormRoutes || []).splice(idx, 1);
  _bsRenderFormRoutesList(targetId);
}

// ── Create manifest (§2.3) ──────────────────────────────────────────────────

function _bsRenderAddForm(el) {
  window._bsFormRoutes = [];
  window._bsCapacityDirty = false;
  window._bsFormTiming = 'am';
  const busOptions = (_trnBusesData||[]).map(b =>
    `<option value="${_bsEsc(b.id)}" data-cap="${b.capacity||''}">${_bsEsc(b.id)}${b.name?' — '+_bsEsc(b.name):''}</option>`).join('');
  const routeOptions = (_trnRoutesData||[]).map(r => `<option value="${_bsEsc(r.id)}">${_bsEsc(r.name||r.id)}</option>`).join('');
  el.innerHTML = `
    <div style="padding:20px;">
      <h3 style="margin:0 0 16px;font-size:1.05rem;color:#2c3e50;">Create Manifest</h3>
      <div class="trn-form-group">
        <label class="trn-form-label">Bus <span style="color:#e74c3c">*</span></label>
        <select id="bs-add-bus" class="fin-search-input trn-form-input" onchange="_bsAddBusChange()">
          <option value="">Select a bus&#8230;</option>${busOptions}
        </select>
      </div>
      <div class="trn-form-grid">
        <div class="trn-form-group">
          <label class="trn-form-label">Service Date <span style="color:#e74c3c">*</span></label>
          <input type="date" id="bs-add-date" class="fin-search-input trn-form-input" value="${_bsFilters.service_date}">
        </div>
        <div class="trn-form-group">
          <label class="trn-form-label">Timing <span style="color:#e74c3c">*</span></label>
          <div style="display:flex;gap:6px;">
            <button type="button" id="bs-add-timing-am" class="fin-btn-teal" onclick="_bsSetAddTiming('am')">AM</button>
            <button type="button" id="bs-add-timing-pm" class="fin-btn-outline" onclick="_bsSetAddTiming('pm')">PM</button>
          </div>
        </div>
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Max Capacity <span style="color:#e74c3c">*</span></label>
        <input type="number" id="bs-add-capacity" class="fin-search-input trn-form-input" min="1" step="1" oninput="window._bsCapacityDirty=true;">
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Routes <span style="color:#e74c3c">*</span></label>
        <p class="trn-stops-hint">Add routes in pickup order. Drag to reorder.</p>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <select id="bs-add-route-pick" class="fin-search-input" style="flex:1;">${routeOptions}</select>
          <button type="button" class="trn-add-stop-btn" onclick="_bsAddRouteToForm('bs-add-routes-list')">+ Add Route</button>
        </div>
        <div id="bs-add-routes-list" class="trn-stops-list"></div>
        <span class="stu-field-error" id="err-bs-add-routes"></span>
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Notes</label>
        <textarea id="bs-add-notes" class="fin-search-input trn-form-input" rows="2"></textarea>
      </div>
      <div style="display:flex;gap:12px;margin-top:20px;">
        <button class="fin-btn-teal" id="bs-add-submit-btn" onclick="_bsSubmitCreate()">Save</button>
        <button class="fin-btn-cancel" onclick="_bsRenderSplit()">Cancel</button>
      </div>
    </div>`;
  _bsRenderFormRoutesList('bs-add-routes-list');
}

function _bsAddBusChange() {
  const sel = document.getElementById('bs-add-bus');
  const capInput = document.getElementById('bs-add-capacity');
  if (!sel || !capInput) return;
  const opt = sel.selectedOptions[0];
  const cap = opt ? opt.dataset.cap : '';
  if (!window._bsCapacityDirty && cap) capInput.value = cap;
}

function _bsSetAddTiming(t) {
  window._bsFormTiming = t;
  const am = document.getElementById('bs-add-timing-am'), pm = document.getElementById('bs-add-timing-pm');
  if (am) am.className = t === 'am' ? 'fin-btn-teal' : 'fin-btn-outline';
  if (pm) pm.className = t === 'pm' ? 'fin-btn-teal' : 'fin-btn-outline';
}

async function _bsSubmitCreate() {
  const busId = document.getElementById('bs-add-bus')?.value;
  const date = document.getElementById('bs-add-date')?.value;
  const capacity = document.getElementById('bs-add-capacity')?.value;
  const notes = (document.getElementById('bs-add-notes')?.value || '').trim();
  const routes = window._bsFormRoutes || [];
  const errRoutes = document.getElementById('err-bs-add-routes');
  if (errRoutes) errRoutes.textContent = '';

  if (!busId) { showToast('Please select a bus.', 'error'); return; }
  if (!date)  { showToast('Please select a service date.', 'error'); return; }
  if (!routes.length) { if (errRoutes) errRoutes.textContent = 'At least one route is required.'; return; }

  const payload = {
    bus_id: busId,
    service_date: date,
    timing: window._bsFormTiming || 'am',
    route_ids: routes,
    notes: notes || null,
  };
  if (capacity) payload.max_capacity = parseInt(capacity, 10);

  const btn = document.getElementById('bs-add-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const res = await apiFetch(`${_BS_API}/`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
  });
  if (btn) { btn.disabled = false; btn.textContent = 'Save'; }

  if (res && res.ok) {
    const created = await res.json();
    showToast('Manifest created.', 'success');
    _bsFilters.service_date = date;
    await _bsRenderSplit(created.id);
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

// ── Edit manifest (§2.5) — identity fields (Bus/Date/Timing) read-only ────

function _bsRenderEditForm(item, el) {
  window._bsFormRoutes = (item.route_ids || []).slice();
  const routeOptions = (_trnRoutesData||[]).map(r => `<option value="${_bsEsc(r.id)}">${_bsEsc(r.name||r.id)}</option>`).join('');
  el.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Manifest</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Transport Management &rsaquo;
          <a href="#" class="fin-bc-link" onclick="_bsRenderSplit(${item.id});return false;">Bus Schedules</a>
          &rsaquo; Edit
        </div>
      </div>
      <div class="trn-form-grid">
        <div class="trn-form-group">
          <label class="trn-form-label">Bus</label>
          <input type="text" class="fin-search-input trn-form-input" value="${_bsEsc(item.bus_plate || item.bus_id)}" readonly style="background:#f5f5f5;color:#666;cursor:not-allowed;">
        </div>
        <div class="trn-form-group">
          <label class="trn-form-label">Service Date</label>
          <input type="text" class="fin-search-input trn-form-input" value="${_bsEsc(item.service_date)}" readonly style="background:#f5f5f5;color:#666;cursor:not-allowed;">
        </div>
        <div class="trn-form-group">
          <label class="trn-form-label">Timing</label>
          <input type="text" class="fin-search-input trn-form-input" value="${(item.timing||'').toUpperCase()}" readonly style="background:#f5f5f5;color:#666;cursor:not-allowed;">
        </div>
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Max Capacity <span style="color:#e74c3c">*</span></label>
        <input type="number" id="bs-edit-capacity" class="fin-search-input trn-form-input" min="1" step="1" value="${_bsEsc(item.max_capacity)}">
        <span class="stu-field-error" id="err-bs-edit-capacity"></span>
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Routes <span style="color:#e74c3c">*</span></label>
        <p class="trn-stops-hint">Add routes in pickup order. Drag to reorder.</p>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <select id="bs-edit-route-pick" class="fin-search-input" style="flex:1;">${routeOptions}</select>
          <button type="button" class="trn-add-stop-btn" onclick="_bsAddRouteToForm('bs-edit-routes-list')">+ Add Route</button>
        </div>
        <div id="bs-edit-routes-list" class="trn-stops-list"></div>
        <span class="stu-field-error" id="err-bs-edit-routes"></span>
      </div>
      <div class="trn-form-group">
        <label class="trn-form-label">Notes</label>
        <textarea id="bs-edit-notes" class="fin-search-input trn-form-input" rows="2">${_bsEsc(item.notes||'')}</textarea>
      </div>
      <div style="display:flex;gap:12px;margin-top:24px;">
        <button class="fin-btn-teal" id="bs-edit-submit-btn" onclick="_bsSubmitEdit(${item.id})">Update</button>
        <button class="fin-btn-cancel" onclick="_bsRenderSplit(${item.id})">Cancel</button>
      </div>
    </div>`;
  _bsRenderFormRoutesList('bs-edit-routes-list');
}

async function _bsSubmitEdit(id) {
  const capacity = document.getElementById('bs-edit-capacity')?.value;
  const notes = (document.getElementById('bs-edit-notes')?.value || '').trim();
  const routes = window._bsFormRoutes || [];
  const errCap = document.getElementById('err-bs-edit-capacity');
  const errRoutes = document.getElementById('err-bs-edit-routes');
  if (errCap) errCap.textContent = '';
  if (errRoutes) errRoutes.textContent = '';

  if (!routes.length) { if (errRoutes) errRoutes.textContent = 'At least one route is required.'; return; }

  // Client-side capacity guard mirrors the server's 409 (§2.5) — checked
  // against whatever rider count we currently have cached for this manifest.
  const riders = _bsRidersCache[id] || [];
  const capNum = parseInt(capacity, 10);
  if (riders.length && capNum < riders.length) {
    if (errCap) errCap.textContent = `Capacity cannot be set below the current rider count (${riders.length}).`;
    return;
  }

  const payload = { max_capacity: capNum, notes: notes || null, route_ids: routes };
  const btn = document.getElementById('bs-edit-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const res = await apiFetch(`${_BS_API}/${id}`, {
    method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
  });
  if (btn) { btn.disabled = false; btn.textContent = 'Update'; }

  if (res && res.ok) {
    showToast('Manifest updated.', 'success');
    await _bsRenderSplit(id);
  } else if (res && res.status === 409) {
    if (errCap) errCap.textContent = await parseApiError(res);
    else showToast('Error: ' + await parseApiError(res), 'error');
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

// ── Detail panel: capacity gauge, lifecycle actions, riders (§2.4/§3) ──────

function _bsShowDetailMsg(text, kind) {
  const el = document.getElementById('bs-detail-msg');
  const isConfig = kind === 'config';
  const html = `<div style="margin-top:10px;padding:10px 14px;border-radius:6px;border-left:3px solid ${isConfig?'var(--gold-500,#C9A227)':'var(--coral-500,#D94040)'};background:${isConfig?'var(--gold-100,#fbe8b0)':'var(--coral-100,#fde0de)'};color:${isConfig?'#7a6110':'var(--coral-600,#c0392b)'};font-size:0.85rem;">${_bsEsc(text)}</div>`;
  if (el) el.innerHTML = html; else showToast(text, 'error');
}

function _bsDetailActions(item) {
  window._bsPendingSchedule = item;
  _bsActiveScheduleId = item.id;
  const cachedRiders = _bsRidersCache[item.id];
  const riderCount = cachedRiders ? cachedRiders.length : (item.rider_count ?? 0);
  const pct = item.max_capacity ? Math.min(100, Math.round((riderCount / item.max_capacity) * 100)) : 0;
  const gaugeColor = pct >= 100 ? 'var(--coral-500,#D94040)' : pct >= 80 ? 'var(--gold-500,#C9A227)' : 'var(--navy-700,#1B3057)';

  let lifecycle = '';
  if (item.status === 'draft') {
    lifecycle += `<button class="fin-btn-teal" onclick="_bsPublish(${item.id})">Publish</button>`;
  } else if (item.status === 'published') {
    lifecycle += `<button class="fin-btn-teal" onclick="_bsLock(${item.id})">Lock</button>`;
  }
  if (!isLocked(item)) {
    lifecycle += `<button class="fin-btn-cancel" onclick="_bsOpenDeleteModal(${item.id})">Delete</button>`;
  } else {
    lifecycle = `<div style="color:#888;font-size:0.85rem;">Locked — view only.</div>`;
  }

  const html = `
    <div style="width:100%;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <div style="flex:1;height:10px;border-radius:6px;background:#eee;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${gaugeColor};"></div>
        </div>
        <span style="font-size:0.85rem;font-weight:600;color:${gaugeColor};white-space:nowrap;">${riderCount}/${item.max_capacity}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">${lifecycle}</div>
      <div id="bs-detail-msg" style="width:100%;"></div>
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid #eee;">
        <div class="fin-section-label" style="margin-bottom:8px;">Riders</div>
        <div id="bs-riders-wrap">Loading riders&#8230;</div>
      </div>
    </div>`;

  _bsLoadAndRenderRiders(item.id);
  return html;
}

async function _bsPublish(id) {
  const res = await apiFetch(`${_BS_API}/${id}`, {
    method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({status:'published'}),
  });
  if (res && res.ok) { showToast('Manifest published.', 'success'); await _bsRenderSplit(id); }
  else if (res) _bsShowDetailMsg(await parseApiError(res), 'workflow');
}
async function _bsLock(id) {
  const res = await apiFetch(`${_BS_API}/${id}`, {
    method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({status:'locked'}),
  });
  if (res && res.ok) { showToast('Manifest locked.', 'success'); await _bsRenderSplit(id); }
  else if (res) _bsShowDetailMsg(await parseApiError(res), 'workflow');
}

function _bsOpenDeleteModal(id) {
  const wrap = document.createElement('div');
  wrap.id = 'bs-delete-modal';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:400px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Delete Manifest</h3>
      <p style="font-size:0.9rem;color:#444;">Delete this manifest and its riders? This cannot be undone.</p>
      <div id="bs-delete-msg"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('bs-delete-modal').remove()">Cancel</button>
        <button class="fin-btn-teal" onclick="_bsDeleteManifest(${id})">Delete</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

async function _bsDeleteManifest(id) {
  const res = await apiFetch(`${_BS_API}/${id}`, { method: 'DELETE' });
  if (res && (res.ok || res.status === 204)) {
    document.getElementById('bs-delete-modal')?.remove();
    delete _bsRidersCache[id];
    showToast('Manifest deleted.', 'success');
    await _bsRenderSplit();
  } else if (res) {
    const text = await parseApiError(res);
    const m = document.getElementById('bs-delete-msg');
    if (m) m.innerHTML = `<p style="color:var(--coral-500,#D94040);font-size:0.85rem;margin-top:8px;">${_bsEsc(text)}</p>`;
    else showToast('Error: ' + text, 'error');
  }
}

// ── Riders table + daily-add (§3) ───────────────────────────────────────────

async function _bsEnsureStudentsCache() {
  if (_bsStudentsCache) return _bsStudentsCache;
  const res = await apiFetch(`${API_BASE}/students/`);
  _bsStudentsCache = (res && res.ok) ? await res.json() : [];
  return _bsStudentsCache;
}

async function _bsLoadAndRenderRiders(scheduleId) {
  const cached = _bsRidersCache[scheduleId];
  const ridersPromise = cached
    ? Promise.resolve(cached)
    : apiFetch(`${_BS_API}/${scheduleId}/riders`).then(async res => (res && res.ok) ? await res.json() : []);
  const [riders, students] = await Promise.all([ridersPromise, _bsEnsureStudentsCache()]);
  _bsRidersCache[scheduleId] = riders;
  if (_bsActiveScheduleId !== scheduleId) return; // operator moved on while this was in flight
  const wrap = document.getElementById('bs-riders-wrap');
  if (!wrap) return;
  wrap.innerHTML = _bsRenderRidersSection(scheduleId, riders);
  _bsPopulateStudentDatalist(students);
}

function _bsResidencePill(r) {
  if (!r.residence_source || r.residence_source === 'primary') {
    return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.76rem;font-weight:600;color:#666;background:#eee;">Primary</span>`;
  }
  const label = r.residence_source === 'parent_a' ? 'Parent A' : 'Parent B';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.76rem;font-weight:600;color:#7a6110;background:var(--gold-100,#fbe8b0);">${label}</span>`;
}
function _bsSourcePill(source) {
  const styleMap = {
    standing:     'color:#fff;background:var(--navy-700,#1B3057);',
    daily_add:    'color:#7a6110;background:var(--gold-100,#fbe8b0);',
    excel_upload: 'color:#666;background:#eee;',
  };
  const style = styleMap[source] || styleMap.standing;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.76rem;font-weight:600;${style}">${_bsEsc((source||'').replace('_',' '))}</span>`;
}
function _bsAddedTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date().toISOString().split('T')[0];
  return iso.startsWith(today) ? d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString();
}

function _bsRenderRidersSection(scheduleId, riders) {
  const item = window._bsPendingSchedule || {};
  const locked = isLocked(item);
  const rows = riders.length ? riders.map(r => `
    <tr>
      <td style="padding:6px 8px;">${_bsEsc(r.student_name)}<br><span style="color:#999;font-size:0.78rem;">${_bsEsc(r.student_code)}</span></td>
      <td style="padding:6px 8px;">${_bsEsc(r.route_name || r.route_id || '—')}</td>
      <td style="padding:6px 8px;">${_bsResidencePill(r)}${(r.residence_source && r.residence_source !== 'primary' && r.parent_name) ? `<br><span style="color:#999;font-size:0.78rem;">${_bsEsc(r.parent_name)}</span>` : ''}</td>
      <td style="padding:6px 8px;">${_bsSourcePill(r.source)}</td>
      <td style="padding:6px 8px;">${_bsAddedTime(r.added_at)}</td>
      <td style="padding:6px 8px;">${_bsEsc(r.notes || '')}</td>
      <td style="padding:6px 8px;">${locked ? '' : `<button class="trn-stop-remove" onclick="_bsOpenRemoveRiderModal(${scheduleId},${r.id})" title="Remove">&#x2715;</button>`}</td>
    </tr>`).join('') : `<tr><td colspan="7" class="fin-empty">No riders yet.</td></tr>`;

  return `
    ${locked ? '' : _bsDailyAddFormHtml(scheduleId, riders.length, item.max_capacity)}
    <div class="fin-table-wrap" style="margin-top:10px;">
      <table class="fin-table">
        <thead><tr>
          <th>STUDENT</th><th>ROUTE</th><th>RESIDENCE</th><th>SOURCE</th><th>ADDED</th><th>NOTES</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function _bsDailyAddFormHtml(scheduleId, riderCount, maxCapacity) {
  const item = window._bsPendingSchedule || {};
  const routeOptions = (item.route_ids||[]).map(rid => `<option value="${_bsEsc(rid)}">${_bsEsc(_trnRouteName(rid))}</option>`).join('');
  const atCapacity = maxCapacity != null && riderCount >= maxCapacity;
  window._bsRiderResidence = 'primary';
  return `
    <div style="background:#fafafa;border:1px solid #eee;border-radius:6px;padding:12px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
        <div style="flex:1;min-width:180px;">
          <label class="trn-form-label">Student</label>
          <input type="text" id="bs-radd-student-search" class="fin-search-input" list="bs-radd-student-list" placeholder="Search student&#8230;" oninput="_bsResolveRiderStudent(this.value)">
          <datalist id="bs-radd-student-list"></datalist>
          <input type="hidden" id="bs-radd-student-id">
        </div>
        <div style="min-width:140px;">
          <label class="trn-form-label">Route</label>
          <select id="bs-radd-route" class="fin-search-input">${routeOptions}</select>
        </div>
        <div>
          <label class="trn-form-label">Residence</label>
          <div style="display:flex;gap:4px;">
            <button type="button" id="bs-radd-res-primary" class="fin-btn-teal" onclick="_bsSetRiderResidence('primary')">Primary</button>
            <button type="button" id="bs-radd-res-parent_a" class="fin-btn-outline" onclick="_bsSetRiderResidence('parent_a')">Parent A</button>
            <button type="button" id="bs-radd-res-parent_b" class="fin-btn-outline" onclick="_bsSetRiderResidence('parent_b')">Parent B</button>
          </div>
        </div>
      </div>
      <div id="bs-radd-parent-wrap" style="display:none;margin-top:8px;max-width:260px;">
        <label class="trn-form-label">Parent</label>
        <select id="bs-radd-parent" class="fin-search-input"></select>
      </div>
      <div style="margin-top:8px;">
        <input type="text" id="bs-radd-notes" class="fin-search-input" placeholder="Notes (optional)">
      </div>
      <p style="color:#888;font-size:0.78rem;margin:8px 0 0;">Recording a rider does not charge a fee. Daily-rate billing for ad-hoc riders is coming later.</p>
      <div id="bs-radd-msg" style="margin-top:6px;"></div>
      <div style="margin-top:10px;">
        ${atCapacity
          ? `<button class="fin-btn-teal" disabled style="opacity:0.5;cursor:not-allowed;">Manifest is at capacity (${maxCapacity})</button>`
          : `<button class="fin-btn-teal" id="bs-radd-submit-btn" onclick="_bsSubmitDailyAdd(${scheduleId})">Add Rider</button>`}
      </div>
    </div>`;
}

function _bsPopulateStudentDatalist(students) {
  const dl = document.getElementById('bs-radd-student-list');
  if (!dl) return;
  window._bsStudentLabelMap = {};
  dl.innerHTML = (students||[]).map(s => {
    const label = `${s.first_name||''} ${s.last_name||''} (${s.student_id||s.id})`.trim();
    window._bsStudentLabelMap[label] = s.id;
    return `<option value="${_bsEsc(label)}"></option>`;
  }).join('');
}

function _bsResolveRiderStudent(val) {
  const id = (window._bsStudentLabelMap||{})[val];
  const hidden = document.getElementById('bs-radd-student-id');
  if (hidden) hidden.value = id || '';
  if (window._bsRiderResidence && window._bsRiderResidence !== 'primary') _bsLoadParentOptions();
}

function _bsSetRiderResidence(mode) {
  window._bsRiderResidence = mode;
  ['primary','parent_a','parent_b'].forEach(m => {
    const btn = document.getElementById(`bs-radd-res-${m}`);
    if (btn) btn.className = m === mode ? 'fin-btn-teal' : 'fin-btn-outline';
  });
  const wrap = document.getElementById('bs-radd-parent-wrap');
  if (!wrap) return;
  if (mode === 'primary') { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  _bsLoadParentOptions();
}

// Shared with the residence-plan popover (§6) — one fetch per student, cached
// while the view is open (§8.4: two pickers, one source).
async function _bsLoadParentOptions() {
  const studentId = document.getElementById('bs-radd-student-id')?.value;
  const sel = document.getElementById('bs-radd-parent');
  if (!sel) return;
  if (!studentId) { sel.innerHTML = '<option value="">Pick a student first</option>'; return; }
  let guardians = _bsGuardiansCache[studentId];
  if (!guardians) {
    const res = await apiFetch(`${API_BASE}/students/${studentId}/guardians`);
    guardians = (res && res.ok) ? await res.json() : [];
    _bsGuardiansCache[studentId] = guardians;
  }
  sel.innerHTML = guardians.length
    ? guardians.map(g => `<option value="${g.id}">${_bsEsc(g.full_name)}${g.relationship?' ('+_bsEsc(g.relationship)+')':''}</option>`).join('')
    : '<option value="">No guardians on file</option>';
}

async function _bsSubmitDailyAdd(scheduleId) {
  const msg = document.getElementById('bs-radd-msg');
  if (msg) msg.innerHTML = '';
  const studentId = document.getElementById('bs-radd-student-id')?.value;
  const routeId = document.getElementById('bs-radd-route')?.value;
  const notes = (document.getElementById('bs-radd-notes')?.value || '').trim();
  const residence = window._bsRiderResidence || 'primary';
  const parentId = document.getElementById('bs-radd-parent')?.value;

  if (!studentId) { if (msg) msg.innerHTML = `<span style="color:var(--coral-500,#D94040);font-size:0.85rem;">Pick a student from the list.</span>`; return; }
  if ((residence === 'parent_a' || residence === 'parent_b') && !parentId) {
    if (msg) msg.innerHTML = `<span style="color:var(--coral-500,#D94040);font-size:0.85rem;">Pick a parent for this residence.</span>`;
    return;
  }
  // Client-side capacity/duplicate checks are UX; the server 409s are the
  // boundary (races happen when two operators edit one manifest) — §8.2.
  const riders = _bsRidersCache[scheduleId] || [];
  if (riders.some(r => String(r.student_id) === String(studentId))) {
    if (msg) msg.innerHTML = `<span style="color:var(--coral-500,#D94040);font-size:0.85rem;">This student is already on this manifest.</span>`;
    return;
  }

  const payload = { student_id: parseInt(studentId, 10), route_id: routeId || null, residence_source: residence, notes: notes || null };
  if (residence !== 'primary') payload.parent_info_id = parseInt(parentId, 10);

  const btn = document.getElementById('bs-radd-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
  const res = await apiFetch(`${_BS_API}/${scheduleId}/riders`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
  });
  if (btn) { btn.disabled = false; btn.textContent = 'Add Rider'; }

  if (res && res.ok) {
    delete _bsRidersCache[scheduleId];
    if (window._bsPendingSchedule) window._bsPendingSchedule.rider_count = (window._bsPendingSchedule.rider_count||0) + 1;
    showToast('Rider added.', 'success');
    await _bsLoadAndRenderRiders(scheduleId);
  } else if (res && res.status === 409) {
    if (msg) msg.innerHTML = `<span style="color:var(--coral-500,#D94040);font-size:0.85rem;">${_bsEsc(await parseApiError(res))}</span>`;
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

function _bsOpenRemoveRiderModal(scheduleId, riderId) {
  const wrap = document.createElement('div');
  wrap.id = 'bs-remove-rider-modal';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:400px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Remove Rider</h3>
      <p style="font-size:0.9rem;color:#444;">Remove this rider from the manifest?</p>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('bs-remove-rider-modal').remove()">Cancel</button>
        <button class="fin-btn-teal" onclick="_bsRemoveRider(${scheduleId},${riderId})">Remove</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

async function _bsRemoveRider(scheduleId, riderId) {
  const res = await apiFetch(`${_BS_API}/${scheduleId}/riders/${riderId}`, { method: 'DELETE' });
  document.getElementById('bs-remove-rider-modal')?.remove();
  if (res && (res.ok || res.status === 204)) {
    delete _bsRidersCache[scheduleId];
    if (window._bsPendingSchedule) window._bsPendingSchedule.rider_count = Math.max(0, (window._bsPendingSchedule.rider_count||1) - 1);
    showToast('Rider removed.', 'success');
    await _bsLoadAndRenderRiders(scheduleId);
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

// ── Generate Standing (§4) — idempotent, safe to rerun ─────────────────────

function _bsOpenGenerateModal() {
  const today = new Date().toISOString().split('T')[0];
  const wrap = document.createElement('div');
  wrap.id = 'bs-generate-modal';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:white;border-radius:8px;padding:24px;width:400px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:#2c3e50;">Generate Standing Manifests</h3>
      <div class="trn-form-group">
        <label class="trn-form-label">Service Date</label>
        <input type="date" id="bs-gen-date" class="fin-search-input trn-form-input" value="${_bsFilters.service_date || today}">
      </div>
      <div id="bs-gen-msg"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="document.getElementById('bs-generate-modal').remove()">Cancel</button>
        <button class="fin-btn-teal" id="bs-gen-submit-btn" onclick="_bsGenerateStanding()">Generate</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

async function _bsGenerateStanding() {
  const date = document.getElementById('bs-gen-date')?.value;
  const msg = document.getElementById('bs-gen-msg');
  if (msg) msg.innerHTML = '';
  if (!date) { if (msg) msg.innerHTML = `<p style="color:var(--coral-500,#D94040);font-size:0.85rem;">Service date is required.</p>`; return; }

  const btn = document.getElementById('bs-gen-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  const res = await apiFetch(`${_BS_API}/generate-standing`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({service_date: date}),
  });
  if (btn) { btn.disabled = false; btn.textContent = 'Generate'; }

  if (res && res.ok) {
    document.getElementById('bs-generate-modal')?.remove();
    showToast(`Standing manifests generated for ${date}.`, 'success');
    _bsFilters.service_date = date;
    await _bsRenderSplit();
  } else if (res) {
    if (msg) msg.innerHTML = `<p style="color:var(--coral-500,#D94040);font-size:0.85rem;">${_bsEsc(await parseApiError(res))}</p>`;
  }
}

// ==================== BUS SCHEDULES BULK UPLOAD (§5) ====================
// Third sibling of the Tendepay Import / Fund Loads upload wizards — same
// step badges, review-table chrome, banner styles, dry-run→commit flow
// (see _tpFlWiz in finance.js, mirrored deliberately). Neither upload
// response is typed in openapi.json (both routes return a bare `schema: {}`)
// so field reads below are defensive/best-guess — verify against a live
// dry-run the first time this actually runs and adjust the `??`/`||`
// fallbacks if the real field names differ.

let _bsUpWiz = null;
function _bsUpNewWizState() {
  return { step: 1, file: null, filename: null, postable: [], errors: [], skipped: [] };
}

async function loadTrnBusSchedulesUploadView(container) {
  _bsUpWiz = _bsUpNewWizState();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Bus Schedules Bulk Upload</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Transport Management &rsaquo; Bus Schedules Bulk Upload</div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <span class="fin-wizard-step-badge" id="bs-up-badge-1">1. Upload</span>
        <span class="fin-wizard-step-badge" id="bs-up-badge-2">2. Review</span>
        <span class="fin-wizard-step-badge" id="bs-up-badge-3">3. Commit</span>
      </div>
      <div id="bs-up-body"></div>
    </div>`;
  _bsUpRenderStep();
}

function _bsUpRenderBadges() {
  [1, 2, 3].forEach(n => {
    const el = document.getElementById(`bs-up-badge-${n}`);
    if (!el) return;
    el.style.cssText = n === _bsUpWiz.step
      ? 'padding:6px 14px;border-radius:14px;background:var(--navy-700,#1B3057);color:#fff;font-weight:600;font-size:0.85rem;'
      : 'padding:6px 14px;border-radius:14px;background:#eee;color:#888;font-size:0.85rem;';
  });
}

function _bsUpRenderStep() {
  _bsUpRenderBadges();
  if (_bsUpWiz.step === 1) _bsUpRenderStep1();
  else if (_bsUpWiz.step === 2) _bsUpRenderStep2();
  else _bsUpRenderStep3();
}

// ── Step 1 — column hints + template (§5.1) ────────────────────────────────

async function _bsUpRenderStep1() {
  const body = document.getElementById('bs-up-body');
  body.innerHTML = '<p class="sa-loading">Loading column contract&#8230;</p>';
  let cols = { columns: [], notes: '' };
  try {
    const res = await apiFetch(`${_BS_API}/upload/expected-columns`);
    if (res && res.ok) cols = await res.json();
  } catch (_) {}
  const colList = cols.columns || [...(cols.required_columns || []), ...(cols.optional_columns || [])];
  const colRows = colList.map(c => `
    <tr><td>${_bsEsc(c.header || '')}</td><td>${_bsEsc(c.description || '')}</td><td>${_bsEsc(c.example ?? '')}</td></tr>`).join('');
  const notesHtml = cols.notes ? `
    <div style="background:#eef3fb;border-radius:8px;padding:12px 16px;margin:12px 0;font-size:0.85rem;color:#2c3e50;white-space:pre-wrap;">${_bsEsc(cols.notes)}</div>` : '';
  body.innerHTML = `
    <div class="fin-form-wrap">
      <div class="fin-section-label">Expected File Format</div>
      <p style="font-size:0.82rem;color:#888;margin:4px 0 10px;">
        Headers match case-insensitive and space/underscore-insensitive. Required: SERVICE DATE, TIMING, BUS PLATE, ROUTE ID, STUDENT ID.
        PARENT NAME is required when RESIDENCE is PARENT_A or PARENT_B, matched case-insensitively against the student's guardian names.
      </p>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Column</th><th>Description</th><th>Example</th></tr></thead>
        <tbody>${colRows || '<tr><td colspan="3" class="fin-empty">Could not load the column contract.</td></tr>'}</tbody>
      </table></div>
      ${notesHtml}
      <div style="margin-top:16px;display:flex;gap:10px;align-items:center;">
        <button class="fin-btn-outline" onclick="_bsUpDownloadTemplate()">Download Template</button>
        <input type="file" id="bs-up-file" accept=".csv,.xlsx,.xls" style="display:none;" onchange="_bsUpUploadFile(this)">
        <button class="fin-btn-teal" onclick="document.getElementById('bs-up-file').click()">Choose File &amp; Preview</button>
        <span id="bs-up-status" style="color:#888;font-size:0.85rem;"></span>
      </div>
    </div>`;
}

async function _bsUpDownloadTemplate() {
  await authBlobDownload(`${_BS_API}/upload/template`, 'bus_schedules_upload_template.xlsx', {
    errorPrefix: 'Could not download template: ',
  });
}

async function _bsUpUploadFile(input) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('bs-up-status');
  if (statusEl) statusEl.textContent = 'Uploading…';
  const fd = new FormData();
  fd.append('file', file);
  // dry_run=true — zero side effects.
  const res = await apiFetch(`${_BS_API}/upload?dry_run=true`, { method: 'POST', body: fd });
  if (!res || !res.ok) {
    if (statusEl) statusEl.textContent = '';
    showToast('Preview failed: ' + (res ? await parseApiError(res) : 'network error'), 'error');
    return;
  }
  const data = await res.json();
  _bsUpWiz.file = file;
  _bsUpWiz.filename = file.name;
  _bsUpWiz.postable = data.postable || [];
  _bsUpWiz.errors = data.errors || data.resolution_errors || [];
  _bsUpWiz.skipped = data.skipped_rows || data.skipped || [];
  _bsUpWiz.step = 2;
  _bsUpRenderStep();
}

// ── Step 2 — dry-run preview (§5.2) ─────────────────────────────────────────

function _bsUpRenderStep2() {
  const body = document.getElementById('bs-up-body');
  const rows = _bsUpWiz.postable.map((r, i) => {
    const rowNum = r.row ?? r.row_number ?? (i + 1);
    return `<tr>
      <td>${_bsEsc(String(rowNum))}</td>
      <td>${_bsEsc(r.service_date || '')}</td>
      <td>${_bsEsc((r.timing || '').toString().toUpperCase())}</td>
      <td>${_bsEsc(r.bus_plate || r.bus_id || '')}</td>
      <td>${_bsEsc(r.route_name || r.route_id || '')}</td>
      <td>${_bsEsc(r.student_name || r.student_id || '')}</td>
      <td>${_bsEsc((r.residence || r.residence_source || 'PRIMARY').toString().toUpperCase())}</td>
      <td>${_bsEsc(r.parent_name || '')}</td>
      <td>${_bsEsc(r.notes || '')}</td>
    </tr>`;
  }).join('');

  const skippedHtml = _bsUpWiz.skipped.length ? `
    <details style="margin-top:14px;">
      <summary style="cursor:pointer;font-weight:600;color:#2c3e50;">Skipped rows (${_bsUpWiz.skipped.length})</summary>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Row</th><th>Reason</th></tr></thead>
        <tbody>${_bsUpWiz.skipped.map(r => `<tr><td>${_bsEsc(String(r.row ?? r.row_number ?? ''))}</td><td>${_bsEsc(r.reason || '')}</td></tr>`).join('')}</tbody>
      </table></div>
    </details>` : '';

  // The workflow test confirms a bad bus plate surfaces as a per-row error
  // (§5.2) — always render row-level errors, not just a global failure.
  const errorsHtml = _bsUpWiz.errors.length ? `
    <div style="background:var(--coral-100,#fde0de);color:var(--coral-600,#c0392b);padding:12px 16px;border-radius:8px;margin-top:14px;font-size:0.85rem;">
      <strong>Rows that can't be posted:</strong>
      <ul style="margin:8px 0 0 18px;">
        ${_bsUpWiz.errors.map(e => `<li>${(e.row != null || e.row_number != null) ? `<strong>Row ${_bsEsc(String(e.row ?? e.row_number))}:</strong> ` : ''}${_bsEsc(e.reason || e.msg || JSON.stringify(e))}</li>`).join('')}
      </ul>
    </div>` : '';

  const commitBlocked = _bsUpWiz.errors.length > 0;

  body.innerHTML = `
    <div class="fin-form-wrap">
      <div class="fin-controls-row">
        <div class="fin-controls-left">${_bsUpWiz.postable.length} postable row${_bsUpWiz.postable.length === 1 ? '' : 's'}</div>
      </div>
      <div class="fin-table-wrap"><table class="fin-table">
        <thead><tr><th>Row</th><th>Service Date</th><th>Timing</th><th>Bus</th><th>Route</th><th>Student</th><th>Residence</th><th>Parent</th><th>Notes</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="9" class="fin-empty">No postable rows in this file.</td></tr>'}</tbody>
      </table></div>
      ${errorsHtml}
      ${skippedHtml}
      <div class="fin-form-actions">
        <button class="fin-btn-cancel" onclick="_bsUpWiz.step=1;_bsUpRenderStep();">Back</button>
        <button class="fin-btn-teal" ${commitBlocked ? 'disabled title="Resolve the errors above before committing."' : ''} onclick="_bsUpWiz.step=3;_bsUpRenderStep();">Continue</button>
      </div>
    </div>`;
}

// ── Step 3 — commit (§5.3) ──────────────────────────────────────────────────

function _bsUpRenderStep3() {
  const body = document.getElementById('bs-up-body');
  body.innerHTML = `
    <div class="fin-form-wrap">
      <p style="font-size:0.9rem;color:#444;">Ready to post ${_bsUpWiz.postable.length} row${_bsUpWiz.postable.length === 1 ? '' : 's'}, creating new manifests where needed. This cannot be undone from here.</p>
      <div class="fin-form-actions">
        <button class="fin-btn-cancel" onclick="_bsUpWiz.step=2;_bsUpRenderStep();">Back</button>
        <button class="fin-btn-teal" id="bs-up-commit-btn" onclick="_bsUpCommit()">Commit</button>
      </div>
      <div id="bs-up-commit-result" style="margin-top:14px;"></div>
    </div>`;
}

async function _bsUpCommit() {
  const btn = document.getElementById('bs-up-commit-btn');
  const resultEl = document.getElementById('bs-up-commit-result');
  if (btn) { btn.disabled = true; btn.textContent = 'Committing…'; }
  const fd = new FormData();
  fd.append('file', _bsUpWiz.file);
  // dry_run=false (default) — re-submits the same File object from Step 1,
  // not a stored batch id: nothing in this contract returns one to resume from.
  const res = await apiFetch(`${_BS_API}/upload?dry_run=false`, { method: 'POST', body: fd });

  if (res && res.ok) {
    const data = await res.json();
    const manifestsCreated = data.manifests_created ?? 0;
    const ridersAdded = data.riders_added ?? (data.posted_count ?? _bsUpWiz.postable.length);
    if (resultEl) resultEl.innerHTML = `
      <div style="background:#dcf3e2;border-left:3px solid #1e7e34;padding:12px 16px;border-radius:8px;color:#1e7e34;font-size:0.85rem;">
        Created ${manifestsCreated} manifest${manifestsCreated === 1 ? '' : 's'}, added ${ridersAdded} rider${ridersAdded === 1 ? '' : 's'}.
        <a href="#" onclick="_bsUpGoToDate();return false;" style="color:#1e7e34;font-weight:600;text-decoration:underline;">View schedules</a>
      </div>`;
    showToast('Bus schedules uploaded.', 'success');
    if (btn) btn.textContent = 'Committed';
    return;
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Commit'; }
  if (!res) { showToast('Network error.', 'error'); return; }
  const body = await res.json().catch(() => null);
  const detail = body?.detail;

  if (res.status === 400) {
    const errs = (typeof detail === 'object' && Array.isArray(detail?.errors)) ? detail.errors : [];
    const hint = (typeof detail === 'object' && detail?.hint) || '';
    if (resultEl) resultEl.innerHTML = `
      <div style="background:var(--coral-100,#fde0de);color:var(--coral-600,#c0392b);padding:12px 16px;border-radius:8px;font-size:0.85rem;">
        <strong>Could not post — nothing has been posted.</strong>
        ${errs.length ? `<ul style="margin:8px 0 0 18px;">${errs.map(e => `<li>${e.row != null ? `Row ${_bsEsc(String(e.row))}: ` : ''}${_bsEsc(e.reason || e.msg || JSON.stringify(e))}</li>`).join('')}</ul>` : `<div style="margin-top:6px;">${_bsEsc(typeof detail === 'string' ? detail : JSON.stringify(detail))}</div>`}
        ${hint ? `<div style="margin-top:8px;font-style:italic;">${_bsEsc(hint)}</div>` : ''}
      </div>`;
  } else if (res.status === 409 || res.status === 413) {
    if (resultEl) resultEl.innerHTML = `<div style="background:var(--coral-100,#fde0de);color:var(--coral-600,#c0392b);padding:12px 16px;border-radius:8px;font-size:0.85rem;">${_bsEsc(typeof detail === 'string' ? detail : (detail?.message || 'Could not commit this upload.'))}</div>`;
  } else {
    showToast('Error: ' + (typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : `HTTP ${res.status}`)), 'error');
  }
}

function _bsUpGoToDate() {
  // Jump the Bus Schedules list to the uploaded rows' service date, if every
  // postable row shared one date; otherwise just open the list unfiltered.
  const dates = [...new Set(_bsUpWiz.postable.map(r => r.service_date).filter(Boolean))];
  if (dates.length === 1) _bsFilters.service_date = dates[0];
  loadView('transport-bus-schedules');
}

// ==================== TRANSPORT — CASUAL BUS ASSIGNMENTS ====================
// New sub-section, distinct from StudentRoute (term-standing) — books specific
// dates without a term commitment. Confirmed live against openapi.json
// 2026-07-27: POST/GET /api/transport/casual-assignments/, GET .../{id}.
// No PATCH/DELETE/cancel exists — cancellation is intentionally not built in
// this shipment (§4.8): the finance team cancels/credits the linked invoice
// instead, and the booking record stays as the source of truth.

function _cbEsc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let _cbStudentsCache = null;
let _cbTermsCache = null;
let _cbStaffCache = null;
let _cbRouteBusesCache = {}; // route_id -> linked BusRead[] (no reverse-lookup endpoint exists; derived by checking every bus's own .routes)
let _cbDates = [];

async function _cbEnsureStudentsCache() {
  if (_cbStudentsCache) return;
  const res = await apiFetch(`${API_BASE}/students/`);
  _cbStudentsCache = (res && res.ok) ? _toArray(await res.json()) : [];
}
async function _cbEnsureTermsCache() {
  if (_cbTermsCache) return;
  const res = await apiFetch(`${API_BASE}/terms`);
  _cbTermsCache = (res && res.ok) ? _toArray(await res.json()) : [];
}
async function _cbEnsureStaffCache() {
  if (_cbStaffCache) return;
  const res = await apiFetch(`${API_BASE}/hr/employees`);
  const raw = (res && res.ok) ? await res.json() : null;
  _cbStaffCache = raw ? (raw.items || _toArray(raw)) : [];
}
function _cbTermLabel(t) { return t.title || t.name || `Term ${t.id}`; }
function _cbStudentLabel(id) {
  const s = (_cbStudentsCache||[]).find(x => String(x.id) === String(id));
  if (!s) return `#${id}`;
  return `${s.first_name||''} ${s.last_name||''}`.trim() || (s.student_id || `#${id}`);
}
function _cbBusLabel(id) {
  const b = (_trnBusesData||[]).find(x => String(x.id) === String(id));
  return b ? (b.name ? `${b.name} (${b.id})` : b.id) : id;
}
function _cbStaffLabel(id) {
  const e = (_cbStaffCache||[]).find(x => String(x.id) === String(id));
  if (!e) return `#${id}`;
  return `${e.first_name||''} ${e.last_name||''}`.trim() || `#${id}`;
}
function _cbStatusPill(status) {
  if (status === 'cancelled') return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:600;color:#888;background:#eee;text-decoration:line-through;">Cancelled</span>`;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:600;color:#fff;background:var(--navy-700,#1B3057);">Active</span>`;
}
function _cbTimingPill(timing) {
  return `<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700;background:#eee;color:#555;">${(timing||'').toUpperCase()}</span>`;
}

// ── Listing (split-view) ─────────────────────────────────────────────────────
async function loadCasualBusAssignmentsView(container) {
  await Promise.all([_fetchTrnRoutes(), _fetchTrnBuses(), _cbEnsureStudentsCache(), _cbEnsureTermsCache(), _cbEnsureStaffCache()]);
  const cfg = {
    container,
    title: 'Casual Bus Assignments',
    moduleKey: 'transport_management',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Transport Management',view:'transport-bus-schedules'},
      {label:'Casual Bus Assignments'},
    ],
    apiUrl: `${API_BASE}/transport/casual-assignments/`,
    searchFields: [],
    col1Label: 'Student', col2Label: 'Status',
    col1: a => `<strong>${_cbEsc(_cbStudentLabel(a.student_id))}</strong><br><span style="font-weight:400;font-size:12px;color:#888;">${_cbEsc(_trnRouteName(a.route_id))} &middot; ${_cbEsc(_cbBusLabel(a.bus_id))} &middot; ${_cbTimingPill(a.timing)}</span>`,
    col2: a => `${_cbStatusPill(a.status)}<br><span style="font-size:12px;color:#555;">${formatKES(a.total_amount)} &middot; ${a.num_dates} date${a.num_dates===1?'':'s'}</span>`,
    rowLabel: a => _cbStudentLabel(a.student_id),
    rowSub: a => `${(a.status||'').replace(/_/g,' ')} &middot; ${_cbEsc(_trnRouteName(a.route_id))} &middot; ${(a.timing||'').toUpperCase()}`,
    idKey: 'id',
    detailFields: [
      {label:'Student',             key:'student_id', fmt:v=>_cbStudentLabel(v)},
      {label:'Route',               key:'route_id', fmt:v=>_trnRouteName(v)},
      {label:'Bus',                 key:'bus_id', fmt:v=>_cbBusLabel(v)},
      {label:'Timing',              key:'timing', fmt:v=>(v||'').toUpperCase()},
      {label:'Dates Booked',        key:'num_dates'},
      {label:'Daily Rate Snapshot', key:'daily_rate_snapshot', fmt:v=>formatKES(v)},
      {label:'Total Amount',        key:'total_amount', fmt:v=>formatKES(v)},
      {label:'Notes',               key:'notes', fmt:v=>v||'—'},
      {label:'Created By',          key:'created_by', fmt:v=>_cbStaffLabel(v)},
      {label:'Created At',          key:'created_at', fmt:v=>v?new Date(v).toLocaleString():'—'},
    ],
    renderAdd: el => _cbRenderAddForm(el),
    detailActions: item => _cbDetailActionsHtml(item),
  };
  await renderSplitView(cfg);
  _cbInjectStudentFilter(cfg);
}

function _cbInjectStudentFilter(cfg) {
  const listEl = document.querySelector('.split-list');
  if (!listEl) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;';
  wrap.innerHTML = `
    <select id="cb-filter-student" class="fin-form-select" style="width:100%;font-size:12px;">
      <option value="">All Students</option>
      ${(_cbStudentsCache||[]).map(s=>`<option value="${s.id}">${_cbEsc(_cbStudentLabel(s.id))}</option>`).join('')}
    </select>`;
  listEl.insertAdjacentElement('beforebegin', wrap);
  document.getElementById('cb-filter-student').addEventListener('change', e => {
    const sid = e.target.value;
    cfg.apiUrl = `${API_BASE}/transport/casual-assignments/` + (sid ? `?student_id=${sid}` : '');
    window._splitReload && window._splitReload();
  });
}

// ── Detail pane: cross-links (Invoice / Accrual JE / Manifests, deduped),
// dates table, and the "cancel via FeeInvoice" helper note (§4.8) ──────────
function _cbDetailActionsHtml(item) {
  const uniqueScheduleIds = [...new Set((item.dates||[]).map(d => d.bus_schedule_id))];
  const datesRows = (item.dates||[]).map(d => `
    <tr>
      <td>${_cbEsc(d.service_date)}</td>
      <td><a href="#" onclick="_bsOpenDetail(${d.bus_schedule_id});return false;">#${d.bus_schedule_id}</a></td>
      <td>#${d.bus_schedule_rider_id}</td>
    </tr>`).join('') || `<tr><td colspan="3" class="fin-empty">No dates.</td></tr>`;

  return `
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
      ${item.fee_invoice_id ? `<button class="fin-btn-outline" onclick="window._rcvCurrentInvoiceId=${item.fee_invoice_id};loadView('fin-invoice-detail');">View Invoice</button>` : ''}
      ${item.journal_entry_id ? `<button class="fin-btn-outline" onclick="_jeOpenDetail(${item.journal_entry_id})">View Accrual JE</button>` : ''}
      ${uniqueScheduleIds.map(sid => `<button class="fin-btn-outline" onclick="_bsOpenDetail(${sid})">View Manifest #${sid}</button>`).join('')}
    </div>
    <div class="fin-section-label">Dates</div>
    <div class="fin-table-wrap"><table class="fin-li-table">
      <thead><tr><th>Service Date</th><th>Bus Schedule</th><th>Rider ID</th></tr></thead>
      <tbody>${datesRows}</tbody>
    </table></div>
    <div class="fin-field-hint fin-field-hint-info" style="margin-top:12px;">To cancel a trip, cancel or credit the linked fee invoice from the Finance module. The booking record stays on file.</div>`;
}

// ── Add ("Book") ──────────────────────────────────────────────────────────────
function _cbPrereqPanelHtml() {
  return `
    <details style="margin-bottom:14px;background:var(--navy-50,#EEF3FA);border:1px solid var(--navy-100,#DCE6F5);border-radius:8px;padding:10px 14px;">
      <summary style="cursor:pointer;font-weight:600;color:var(--navy-700,#1B3057);font-size:0.88rem;">Before you book</summary>
      <ul style="margin:8px 0 0;padding-left:18px;font-size:0.82rem;color:#555;">
        <li>The Route exists and has a daily rate greater than 0.</li>
        <li>The Bus exists.</li>
        <li>The Bus is linked to the Route (via the Transport module).</li>
        <li>The school's AR control account is configured (ops task).</li>
        <li>An active Transport Revenue account exists in the Chart of Accounts.</li>
      </ul>
    </details>`;
}
function _cbDatesChipsHtml() {
  if (_cbDates.length === 0) return `<p style="color:#888;font-size:12px;margin:6px 0;">No dates selected yet.</p>`;
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;">
    ${_cbDates.map((d, i) => `<span style="display:inline-flex;align-items:center;gap:6px;background:var(--navy-50,#EEF3FA);color:var(--navy-700,#1B3057);padding:4px 10px;border-radius:14px;font-size:12px;">${_cbEsc(d)}<button type="button" style="background:none;border:none;color:#c0392b;cursor:pointer;font-weight:700;" onclick="_cbRemoveDate(${i})">&times;</button></span>`).join('')}
  </div>`;
}
function _cbAddDate() {
  const input = document.getElementById('cb-f-date-picker');
  const val = input.value;
  if (!val) return;
  if (!_cbDates.includes(val)) { _cbDates.push(val); _cbDates.sort(); }
  input.value = '';
  _cbRenderDatesArea();
}
function _cbRemoveDate(idx) {
  _cbDates.splice(idx, 1);
  _cbRenderDatesArea();
}
function _cbRenderDatesArea() {
  const chipsEl = document.getElementById('cb-f-dates-chips');
  if (chipsEl) chipsEl.innerHTML = _cbDatesChipsHtml();
  const countEl = document.getElementById('cb-f-dates-count');
  if (countEl) countEl.textContent = `${_cbDates.length} date(s) selected`;
  _cbRecalcTotal();
}
function _cbRecalcTotal() {
  const rate = window._cbSelectedDailyRate || 0;
  const total = rate * _cbDates.length;
  const el = document.getElementById('cb-f-total-preview');
  if (el) el.textContent = formatKES(total);
}
function _cbSetTiming(t) {
  window._cbTiming = t;
  const amBtn = document.getElementById('cb-f-timing-am');
  const pmBtn = document.getElementById('cb-f-timing-pm');
  if (amBtn) amBtn.className = t === 'am' ? 'fin-btn-teal' : 'fin-btn-outline';
  if (pmBtn) pmBtn.className = t === 'pm' ? 'fin-btn-teal' : 'fin-btn-outline';
}
async function _cbLoadBusesForRoute(routeId) {
  const busSelect = document.getElementById('cb-f-bus');
  const warnEl = document.getElementById('cb-f-bus-warning');
  if (!busSelect) return;
  if (!routeId) { busSelect.innerHTML = '<option value="">Select a route first</option>'; if (warnEl) warnEl.style.display = 'none'; return; }
  busSelect.innerHTML = '<option value="">Loading buses&#8230;</option>';
  if (!_cbRouteBusesCache[routeId]) {
    const buses = _trnBusesData || [];
    const linked = [];
    // No "buses linked to this route" endpoint exists — only the reverse
    // (POST/DELETE /buses/{bus_id}/routes/{route_id} to manage the link, and
    // GET /buses/{bus_id} returning that bus's own .routes). Derive the set
    // by checking every bus once per route, cached thereafter.
    await Promise.all(buses.map(async b => {
      const r = await apiFetch(`${API_BASE}/buses/${encodeURIComponent(b.id)}`);
      const full = (r && r.ok) ? await r.json() : null;
      const routeIds = (full?.routes || []).map(x => String(x.id));
      if (routeIds.includes(String(routeId))) linked.push(b);
    }));
    _cbRouteBusesCache[routeId] = linked;
  }
  const linked = _cbRouteBusesCache[routeId];
  if (linked.length === 0) {
    busSelect.innerHTML = '<option value="">No bus linked to this route</option>';
    if (warnEl) warnEl.style.display = 'block';
  } else {
    if (warnEl) warnEl.style.display = 'none';
    busSelect.innerHTML = `<option value="">Please Select</option>${linked.map(b=>`<option value="${b.id}">${_cbEsc(_cbBusLabel(b.id))}</option>`).join('')}`;
  }
}
function _cbOnRouteChange(routeId) {
  const route = (_trnRoutesData||[]).find(r => String(r.id) === String(routeId));
  const rateEl = document.getElementById('cb-f-daily-rate-hint');
  const dailyRate = route ? (parseFloat(route.daily_rate) || 0) : 0;
  if (rateEl) rateEl.textContent = route ? `Daily rate: ${formatKES(dailyRate)}` : '';
  window._cbSelectedDailyRate = dailyRate;
  _cbLoadBusesForRoute(routeId);
  _cbRecalcTotal();
}
function _cbPopulateStudentDatalist() {
  const dl = document.getElementById('cb-f-student-list');
  if (!dl) return;
  window._cbStudentMap = {};
  dl.innerHTML = (_cbStudentsCache||[]).map(s => {
    const label = `${s.first_name||''} ${s.last_name||''} (${s.student_id||s.id})`.trim();
    window._cbStudentMap[label] = s.id;
    return `<option value="${_cbEsc(label)}"></option>`;
  }).join('');
}
function _cbResolveStudentInput(val) {
  const id = (window._cbStudentMap||{})[val];
  const hidden = document.getElementById('cb-f-student-id');
  if (hidden) hidden.value = id || '';
}

function _cbRenderAddForm(el) {
  _cbDates = [];
  window._cbSelectedDailyRate = 0;
  window._cbTiming = 'am';
  const todayStr = new Date().toISOString().slice(0,10);
  el.innerHTML = `
    <div class="fin-form-wrap" style="max-width:100%;">
      <h3 class="fin-title" style="font-size:1rem;">Book a Casual Bus Trip</h3>
      ${_cbPrereqPanelHtml()}
      <div class="fin-form-group">
        <label class="fin-form-label">Student <span class="fin-required">*</span></label>
        <input type="text" id="cb-f-student-search" class="fin-search-input" list="cb-f-student-list" placeholder="Search student&#8230;" oninput="_cbResolveStudentInput(this.value)">
        <datalist id="cb-f-student-list"></datalist>
        <input type="hidden" id="cb-f-student-id">
        <span class="fin-field-error" id="cb-f-student-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Route <span class="fin-required">*</span></label>
        <select id="cb-f-route" class="fin-form-select" onchange="_cbOnRouteChange(this.value)">
          <option value="">Please Select</option>
          ${(_trnRoutesData||[]).map(r=>`<option value="${r.id}">${_cbEsc(r.name||r.id)}</option>`).join('')}
        </select>
        <span class="fin-field-hint fin-field-hint-info" id="cb-f-daily-rate-hint"></span>
        <span class="fin-field-error" id="cb-f-route-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Bus <span class="fin-required">*</span></label>
        <select id="cb-f-bus" class="fin-form-select"><option value="">Select a route first</option></select>
        <div id="cb-f-bus-warning" class="fin-field-hint fin-field-hint-warning" style="display:none;">No bus is linked to this route. Link one via the transport module first.</div>
        <span class="fin-field-error" id="cb-f-bus-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Timing <span class="fin-required">*</span></label>
        <div style="display:flex;gap:6px;">
          <button type="button" id="cb-f-timing-am" class="fin-btn-teal" onclick="_cbSetTiming('am')">AM</button>
          <button type="button" id="cb-f-timing-pm" class="fin-btn-outline" onclick="_cbSetTiming('pm')">PM</button>
        </div>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Dates <span class="fin-required">*</span></label>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="date" id="cb-f-date-picker" class="fin-form-input" style="max-width:180px;">
          <button type="button" class="fin-btn-outline" onclick="_cbAddDate()">+ Add Date</button>
        </div>
        <div id="cb-f-dates-chips">${_cbDatesChipsHtml()}</div>
        <span id="cb-f-dates-count" style="font-size:12px;color:#888;">0 date(s) selected</span>
        <span class="fin-field-error" id="cb-f-dates-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Term</label>
        <select id="cb-f-term" class="fin-form-select">
          <option value="">— Server resolves current term —</option>
          ${(_cbTermsCache||[]).map(t=>`<option value="${t.id}">${_cbEsc(_cbTermLabel(t))}</option>`).join('')}
        </select>
        <span class="fin-field-error" id="cb-f-term-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Due Date</label>
        <input type="date" id="cb-f-due-date" class="fin-form-input" value="${todayStr}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="cb-f-notes" class="fin-form-textarea" rows="2"></textarea>
      </div>
      <div style="background:var(--navy-700,#1B3057);color:#fff;border-radius:8px;padding:14px 16px;margin:12px 0;">
        <div style="font-size:11px;opacity:.75;text-transform:uppercase;letter-spacing:.05em;">Total</div>
        <div style="font-size:1.3rem;font-weight:700;margin-top:4px;" id="cb-f-total-preview">${formatKES(0)}</div>
      </div>
      <div id="cb-f-msg"></div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_cbSubmitBooking()">Book</button>
        <button class="fin-btn-cancel" onclick="window._splitReload && window._splitReload()">Cancel</button>
      </div>
    </div>`;
  _cbPopulateStudentDatalist();
}

async function _cbSubmitBooking() {
  ['student','route','bus','dates','term'].forEach(f => { const e = document.getElementById(`cb-f-${f}-err`); if (e) e.textContent = ''; });
  document.getElementById('cb-f-msg').innerHTML = '';
  const studentId = document.getElementById('cb-f-student-id').value;
  const routeId   = document.getElementById('cb-f-route').value;
  const busId     = document.getElementById('cb-f-bus').value;
  const termId    = document.getElementById('cb-f-term').value;
  const dueDate   = document.getElementById('cb-f-due-date').value;
  const notes     = document.getElementById('cb-f-notes').value.trim();

  let valid = true;
  if (!studentId) { document.getElementById('cb-f-student-err').textContent = 'Select a student.'; valid = false; }
  if (!routeId)   { document.getElementById('cb-f-route-err').textContent  = 'This field is required.'; valid = false; }
  if (!busId)     { document.getElementById('cb-f-bus-err').textContent    = 'Select a bus.'; valid = false; }
  if (_cbDates.length === 0) { document.getElementById('cb-f-dates-err').textContent = 'Add at least one date.'; valid = false; }
  if (!valid) return;

  const payload = {
    student_id: parseInt(studentId),
    route_id: routeId,
    bus_id: busId,
    timing: window._cbTiming || 'am',
    dates: _cbDates.slice(),
    term_id: termId ? parseInt(termId) : null,
    notes: notes || null,
    due_date: dueDate || null,
  };
  const res = await apiFetch(`${API_BASE}/transport/casual-assignments/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (res && res.ok) {
    showToast('Casual bus trip booked.', 'success');
    window._splitReload && await window._splitReload();
    return;
  }
  if (!res) return;
  const detail = await parseApiError(res);
  _cbHandleBookingError(res.status, detail);
}

// Classifies every failure mode in §4.7: 404/400/409 are workflow guidance
// (coral, inline on the relevant field), the two 500s are setup/config
// signals (gold callout, "ask ops") — never dumped into one generic toast.
function _cbHandleBookingError(status, detail) {
  if (status === 404 && /student/i.test(detail)) { document.getElementById('cb-f-student-err').textContent = detail; return; }
  if (status === 400 && /student/i.test(detail) && /inactive/i.test(detail)) { document.getElementById('cb-f-student-err').textContent = detail; return; }
  if (status === 404 && /route/i.test(detail)) { document.getElementById('cb-f-route-err').textContent = detail; return; }
  if (status === 404 && /bus/i.test(detail)) { document.getElementById('cb-f-bus-err').textContent = detail; return; }
  if (status === 400 && /does not serve route/i.test(detail)) {
    document.getElementById('cb-f-msg').innerHTML = `<div class="fin-field-error">${_cbEsc(detail)} — <a href="#" onclick="loadView('transport-routes');return false;">Open the Transport module</a></div>`;
    return;
  }
  if (status === 400 && /cannot resolve a term/i.test(detail)) { document.getElementById('cb-f-term-err').textContent = detail; return; }
  if (status === 404 && /term/i.test(detail)) { document.getElementById('cb-f-term-err').textContent = detail; return; }
  if (status === 409) { document.getElementById('cb-f-msg').innerHTML = `<div class="fin-field-error">${_cbEsc(detail)}</div>`; return; }
  if (status === 500 && /(AR_CONTROL_ACCOUNT_ID|Transport Revenue account)/i.test(detail)) {
    document.getElementById('cb-f-msg').innerHTML = `<div class="fin-field-hint fin-field-hint-warning">${_cbEsc(detail)} — this is a setup task; ask ops to configure it.</div>`;
    return;
  }
  document.getElementById('cb-f-msg').innerHTML = `<div class="fin-field-error">${_cbEsc(detail)}</div>`;
}
