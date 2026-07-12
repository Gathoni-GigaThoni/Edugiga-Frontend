// ==================== PROCUREMENT — SUPPLIERS ====================
let _supData = [];
let _supPage = 1, _supPerPage = 10, _supSearch = '';
let _supEditId = null;

document.addEventListener('click', () => {
  document.querySelectorAll('[id^="sup-dd-"]').forEach(d => d.style.display = 'none');
});

// ── List ──────────────────────────────────────────────────────────────────────

async function loadSuppliersView(container) {
  await renderSplitView({
    container,
    title: 'Suppliers',
    moduleKey: 'procurement',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Procurement',view:'procurement-suppliers'},
      {label:'Suppliers'}
    ],
    apiUrl: `${API_BASE}/suppliers/`,
    searchFields: ['name','email','contact_person','phone'],
    col1Label: 'Name', col2Label: 'Status',
    col1: s => s.name || '—',
    col2: s => s.status || (s.is_active===false ? 'Inactive' : 'Active'),
    rowLabel: s => s.name || '—',
    rowSub:   s => s.email || s.phone || '',
    idKey: 'id',
    detailFields: [
      {label:'Name',           key:'name'},
      {label:'Email',          key:'email'},
      {label:'Phone',          key:'phone'},
      {label:'Contact Person', key:'contact_person'},
      {label:'KRA PIN',        key:'kra_pin'},
      {label:'Payment Terms',  key:'payment_terms'},
      {label:'Status',         key:'status'},
    ],
    renderAdd: el => {
      el.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--grey-600)">
        <div style="font-size:2rem;margin-bottom:12px">&#127970;</div>
        <p style="font-weight:600;margin-bottom:8px">Add a Supplier</p>
        <p style="font-size:13px;margin-bottom:20px">Register a new supplier with bank details and contact info.</p>
        <button class="btn-primary" style="padding:10px 24px" onclick="loadView('procurement-suppliers-add')">+ Add Supplier</button>
      </div>`;
    },
    onEdit: item => { _supEditId = item.id; loadView('procurement-suppliers-edit'); },
  });
}

function _supRenderListPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Suppliers</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Procurement &rsaquo; Suppliers &rsaquo; Listing</div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Show <select id="sup-per-page" onchange="_supChangePerPage(this.value)">
            <option value="10">10</option><option value="25">25</option>
            <option value="50">50</option><option value="100">100</option>
          </select> entries &nbsp;|&nbsp; Total <span id="sup-total">0</span>
        </div>
        <div class="fin-controls-right">
          <input id="sup-search" class="fin-search-input" placeholder="Search name, email, contact…"
            onkeyup="_supHandleSearch()" style="width:220px;">
          <button class="fin-btn-teal" onclick="loadView('procurement-suppliers-add')">+ Add Supplier</button>
        </div>
      </div>
      <div id="sup-table-container"></div>
      <div id="sup-pagination"></div>
    </div>`;
  document.getElementById('sup-per-page').value = String(_supPerPage);
  _supRenderTable();
}

function _supHandleSearch() {
  _supSearch = (document.getElementById('sup-search')?.value || '').toLowerCase();
  _supPage = 1;
  _supRenderTable();
}

function _supChangePerPage(val) {
  _supPerPage = parseInt(val);
  _supPage = 1;
  _supRenderTable();
}

function _supGoPage(p) { _supPage = p; _supRenderTable(); }

function _supRenderTable() {
  const filtered = _supSearch
    ? _supData.filter(s =>
        (s.name || '').toLowerCase().includes(_supSearch) ||
        (s.email || '').toLowerCase().includes(_supSearch) ||
        (s.contact_person || '').toLowerCase().includes(_supSearch) ||
        (s.phone || '').toLowerCase().includes(_supSearch))
    : _supData;

  document.getElementById('sup-total').textContent = filtered.length;

  const start = (_supPage - 1) * _supPerPage;
  const paged = filtered.slice(start, start + _supPerPage);

  const rows = !paged.length
    ? `<tr><td colspan="7" class="fin-empty">No suppliers found.</td></tr>`
    : paged.map(s => `<tr>
        <td><strong>${_finEsc(s.name)}</strong></td>
        <td>${_finEsc(s.email || '—')}</td>
        <td>${_finEsc(s.phone || '—')}</td>
        <td>${_finEsc(s.contact_person || '—')}</td>
        <td>${_finEsc(s.kra_pin || '—')}</td>
        <td>${s.is_active !== false
          ? '<span class="sup-chip-active">Active</span>'
          : '<span class="sup-chip-inactive">Inactive</span>'}</td>
        <td class="fin-action-cell">
          <div class="fin-action-wrap">
            <button class="fin-action-btn" onclick="_supToggleDD(event,'${s.id}')">&#8230;</button>
            <div id="sup-dd-${s.id}" class="fin-action-dropdown" style="display:none;">
              <a href="#" onclick="_supOpenEdit('${s.id}');return false;">&#9998; Edit</a>
              ${s.is_active !== false
                ? `<a href="#" onclick="_supToggleActive('${s.id}',false);return false;" style="color:#e0534a;">&#10005; Deactivate</a>`
                : `<a href="#" onclick="_supToggleActive('${s.id}',true);return false;" style="color:#27ae60;">&#10003; Activate</a>`}
            </div>
          </div>
        </td>
      </tr>`).join('');

  document.getElementById('sup-table-container').innerHTML = `
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr>
        <th>NAME</th><th>EMAIL</th><th>PHONE</th>
        <th>CONTACT PERSON</th><th>KRA PIN</th><th>STATUS</th><th>ACTION</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  const totalPages = Math.ceil(filtered.length / _supPerPage);
  let pg = '';
  if (totalPages > 1) {
    for (let i = 1; i <= totalPages; i++)
      pg += `<button class="${i === _supPage ? 'fin-pg-active' : ''}" onclick="_supGoPage(${i})">${i}</button>`;
  }
  document.getElementById('sup-pagination').innerHTML = pg
    ? `<div class="fin-pagination">${pg}</div>` : '';
}

function _supToggleDD(event, id) {
  event.stopPropagation();
  document.querySelectorAll('[id^="sup-dd-"]').forEach(d => {
    if (d.id !== `sup-dd-${id}`) d.style.display = 'none';
  });
  const dd = document.getElementById(`sup-dd-${id}`);
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

// ── Activate / Deactivate ─────────────────────────────────────────────────────

async function _supToggleActive(id, is_active) {
  document.querySelectorAll('[id^="sup-dd-"]').forEach(d => d.style.display = 'none');
  if (!is_active && !confirm('Deactivate this supplier?')) return;
  const res = await apiFetch(`${API_BASE}/suppliers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active }),
  });
  if (!res) return;
  if (res.ok) {
    const idx = _supData.findIndex(s => String(s.id) === String(id));
    if (idx !== -1) _supData[idx].is_active = is_active;
    showToast(is_active ? 'Supplier activated.' : 'Supplier deactivated.', 'success');
    _supRenderTable();
  } else {
    showToast(await parseApiError(res), 'error');
  }
}

// ── Add / Edit Form ───────────────────────────────────────────────────────────

function _supOpenEdit(id) {
  document.querySelectorAll('[id^="sup-dd-"]').forEach(d => d.style.display = 'none');
  _supEditId = id;
  loadView('procurement-suppliers-edit');
}

async function loadSupplierFormView(container, editId) {
  _supEditId = editId || null;
  const isEdit = !!_supEditId;
  let supplier = null;

  if (isEdit) {
    container.innerHTML = '<div class="fin-page"><p style="padding:16px;color:#777;">Loading…</p></div>';
    const res = await apiFetch(`${API_BASE}/suppliers/${_supEditId}`);
    if (!res || !res.ok) {
      showToast('Could not load supplier.', 'error');
      loadView('procurement-suppliers');
      return;
    }
    supplier = await res.json().catch(() => null);
    if (!supplier) {
      // Fallback to cache
      supplier = _supData.find(s => String(s.id) === String(_supEditId)) || null;
    }
  }

  const v = (field) => _finEsc(supplier?.[field] || '');

  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">${isEdit ? 'Edit' : 'Add'} Supplier</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Procurement &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('procurement-suppliers');return false;">Suppliers</a>
          &rsaquo; ${isEdit ? 'Edit' : 'Add'}
        </div>
      </div>

      <div class="fin-form-wrap" style="max-width:800px;">

        <div class="fin-filter-section">
          <div class="fin-section-label">Basic Information</div>
          <div class="fin-form-grid-2">
            <div class="fin-form-group fin-span-2">
              <label class="fin-form-label">Supplier Name <span class="fin-required">*</span></label>
              <input type="text" id="sup-f-name" class="fin-form-input" value="${v('name')}" placeholder="Full supplier / company name">
              <span class="fin-field-error" id="sup-f-name-err"></span>
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Email</label>
              <input type="email" id="sup-f-email" class="fin-form-input" value="${v('email')}" placeholder="supplier@example.com">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Phone</label>
              <input type="tel" id="sup-f-phone" class="fin-form-input" value="${v('phone')}" placeholder="+254 700 000 000">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Contact Person</label>
              <input type="text" id="sup-f-contact" class="fin-form-input" value="${v('contact_person')}" placeholder="Primary contact name">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">KRA PIN</label>
              <input type="text" id="sup-f-kra" class="fin-form-input" value="${v('kra_pin')}" placeholder="e.g. A123456789B">
            </div>
            <div class="fin-form-group fin-span-2">
              <label class="fin-form-label">Address</label>
              <textarea id="sup-f-address" class="fin-form-textarea" rows="2" placeholder="Physical / postal address">${_finEsc(supplier?.address || '')}</textarea>
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Payment Terms</label>
              <select id="sup-f-payment-terms" class="fin-form-select">
                <option value="">-- Select --</option>
                ${['Immediate','Net 7','Net 14','Net 30','Net 45','Net 60','Net 90'].map(t =>
                  `<option value="${t}" ${(supplier?.payment_terms || '') === t ? 'selected' : ''}>${t}</option>`
                ).join('')}
              </select>
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Status</label>
              <select id="sup-f-active" class="fin-form-select">
                <option value="true"  ${supplier?.is_active !== false ? 'selected' : ''}>Active</option>
                <option value="false" ${supplier?.is_active === false  ? 'selected' : ''}>Inactive</option>
              </select>
            </div>
          </div>
        </div>

        <div class="fin-filter-section">
          <div class="fin-section-label">Bank Details</div>
          <div class="fin-form-grid-2">
            <div class="fin-form-group">
              <label class="fin-form-label">Bank Name</label>
              <input type="text" id="sup-f-bank-name" class="fin-form-input" value="${v('bank_name')}" placeholder="e.g. Equity Bank">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Branch</label>
              <input type="text" id="sup-f-bank-branch" class="fin-form-input" value="${v('bank_branch')}" placeholder="Branch name">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Account Name</label>
              <input type="text" id="sup-f-acct-name" class="fin-form-input" value="${v('account_name')}" placeholder="Account holder name">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Account Number</label>
              <input type="text" id="sup-f-acct-no" class="fin-form-input" value="${v('account_number')}" placeholder="Account number">
            </div>
          </div>
        </div>

        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_supSubmit()">
            ${isEdit ? 'Update Supplier' : 'Save Supplier'}
          </button>
          <button class="fin-btn-cancel" onclick="loadView('procurement-suppliers')">Cancel</button>
        </div>
        <div id="sup-form-status" class="fin-form-status" style="margin-top:10px;"></div>
      </div>
    </div>`;
}

async function _supSubmit() {
  const statusEl = document.getElementById('sup-form-status');
  const name = document.getElementById('sup-f-name').value.trim();
  const errEl = document.getElementById('sup-f-name-err');

  errEl.textContent = name ? '' : 'Supplier name is required.';
  if (!name) return;

  const payload = {
    name,
    email:          document.getElementById('sup-f-email').value.trim()       || null,
    phone:          document.getElementById('sup-f-phone').value.trim()       || null,
    contact_person: document.getElementById('sup-f-contact').value.trim()     || null,
    kra_pin:        document.getElementById('sup-f-kra').value.trim()         || null,
    address:        document.getElementById('sup-f-address').value.trim()     || null,
    payment_terms:  document.getElementById('sup-f-payment-terms').value      || null,
    bank_name:      document.getElementById('sup-f-bank-name').value.trim()   || null,
    bank_branch:    document.getElementById('sup-f-bank-branch').value.trim() || null,
    account_name:   document.getElementById('sup-f-acct-name').value.trim()   || null,
    account_number: document.getElementById('sup-f-acct-no').value.trim()     || null,
    is_active:      document.getElementById('sup-f-active').value === 'true',
  };

  const isEdit = !!_supEditId;
  const url    = isEdit ? `${API_BASE}/suppliers/${_supEditId}` : `${API_BASE}/suppliers/`;
  const method = isEdit ? 'PATCH' : 'POST';

  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res) return;

  if (res.ok) {
    const saved = await res.json().catch(() => null);
    if (isEdit) {
      const idx = _supData.findIndex(s => String(s.id) === String(_supEditId));
      if (idx !== -1) _supData[idx] = { ..._supData[idx], ...(saved || payload) };
    } else {
      if (saved) _supData.unshift(saved);
    }
    // Invalidate payables lookup cache so dropdown picks up the new/updated supplier
    _pvLookupsLoaded = false;
    showToast(isEdit ? 'Supplier updated!' : 'Supplier created!', 'success');
    loadView('procurement-suppliers');
  } else {
    const msg = await parseApiError(res);
    statusEl.innerHTML = `<span style="color:#e0534a;font-weight:600;">${msg}</span>`;
  }
}
