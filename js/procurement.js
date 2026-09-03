// ==================== PROCUREMENT — SUPPLIERS ====================
let _supData = [];
let _supPage = 1, _supPerPage = 10, _supSearch = '';
let _supEditId = null;
let _supBanks = [];
let _supBanksLoaded = false;

const _SUP_PAYMENT_MODES = [
  ['bank_transfer',    'Bank Transfer'],
  ['mpesa_paybill',    'M-Pesa Paybill'],
  ['mpesa_till',       'M-Pesa Till'],
  ['mpesa_send_money', 'M-Pesa Send Money'],
  ['cheque',           'Cheque'],
  ['cash',             'Cash'],
];

async function _supEnsureBanks() {
  if (_supBanksLoaded) return;
  try {
    const res = await apiFetch(`${API_BASE}/finance/utilities/financial-institutions/`);
    if (res && res.ok) {
      const data = await res.json().catch(() => []);
      _supBanks = Array.isArray(data) ? data : (data.data || []);
      _supBanksLoaded = true;
    }
  } catch (e) { /* fall back to free text */ }
}

function _supTogglePayMode() {
  const mode = document.getElementById('sup-f-pay-mode')?.value || '';
  const map = {
    bank_transfer:    'sup-sec-bank',
    mpesa_paybill:    'sup-sec-paybill',
    mpesa_till:       'sup-sec-till',
    mpesa_send_money: 'sup-sec-send',
  };
  ['sup-sec-bank','sup-sec-paybill','sup-sec-till','sup-sec-send'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const target = map[mode];
  if (target) {
    const el = document.getElementById(target);
    if (el) el.style.display = '';
  }
  if (mode === 'bank_transfer') _supToggleBankOther();
}

function _supToggleBankOther() {
  const fi = document.getElementById('sup-f-fi')?.value || '';
  const other = document.getElementById('sup-fg-bank-other');
  if (other) other.style.display = fi === '__other' ? '' : 'none';
}

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

  await _supEnsureBanks();

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
              <label style="display:flex;align-items:center;gap:8px;padding:8px 0;">
                <input type="checkbox" id="sup-f-active" ${supplier?.is_active !== false ? 'checked' : ''}>
                <span>Active</span>
              </label>
            </div>
          </div>
        </div>

        <div class="fin-filter-section">
          <div class="fin-section-label">Payment Method</div>
          <div class="fin-form-grid-2">
            <div class="fin-form-group">
              <label class="fin-form-label">Payment Mode</label>
              <select id="sup-f-pay-mode" class="fin-form-select" onchange="_supTogglePayMode()">
                <option value="">-- Select --</option>
                ${_SUP_PAYMENT_MODES.map(([val,lbl]) =>
                  `<option value="${val}" ${(supplier?.payment_mode||'')===val?'selected':''}>${lbl}</option>`
                ).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="fin-filter-section" id="sup-sec-bank" style="display:none">
          <div class="fin-section-label">Bank Details</div>
          <div class="fin-form-grid-2">
            <div class="fin-form-group">
              <label class="fin-form-label">Bank <span class="fin-required">*</span></label>
              <select id="sup-f-fi" class="fin-form-select" onchange="_supToggleBankOther()">
                <option value="">-- Select bank --</option>
                ${_supBanks.map(fi =>
                  `<option value="${fi.id}" ${String(supplier?.financial_institution_id||'')===String(fi.id)?'selected':''}>${_finEsc(fi.institution)}</option>`
                ).join('')}
                <option value="__other" ${supplier?.bank_name && !supplier?.financial_institution_id ? 'selected':''}>Other (specify below)</option>
              </select>
            </div>
            <div class="fin-form-group" id="sup-fg-bank-other" style="display:none">
              <label class="fin-form-label">Bank Name (Other)</label>
              <input type="text" id="sup-f-bank-name" class="fin-form-input" value="${v('bank_name')}" placeholder="Bank name">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Branch</label>
              <input type="text" id="sup-f-bank-branch" class="fin-form-input" value="${v('bank_branch')}" placeholder="Branch name">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Account Name</label>
              <input type="text" id="sup-f-acct-name" class="fin-form-input" value="${v('bank_account_name')}" placeholder="Account holder name">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Account Number <span class="fin-required">*</span></label>
              <input type="text" id="sup-f-acct-no" class="fin-form-input" value="${v('bank_account_number')}" placeholder="Account number">
            </div>
          </div>
        </div>

        <div class="fin-filter-section" id="sup-sec-paybill" style="display:none">
          <div class="fin-section-label">M-Pesa Paybill</div>
          <div class="fin-form-grid-2">
            <div class="fin-form-group">
              <label class="fin-form-label">Paybill Number <span class="fin-required">*</span></label>
              <input type="text" id="sup-f-mp-paybill" class="fin-form-input" value="${v('mpesa_paybill_number')}" placeholder="e.g. 522522" inputmode="numeric">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Account / Reference <span class="fin-required">*</span></label>
              <input type="text" id="sup-f-mp-paybill-acct" class="fin-form-input" value="${v('mpesa_paybill_account')}" placeholder="Account no. as printed by supplier">
            </div>
          </div>
        </div>

        <div class="fin-filter-section" id="sup-sec-till" style="display:none">
          <div class="fin-section-label">M-Pesa Till (Buy Goods)</div>
          <div class="fin-form-grid-2">
            <div class="fin-form-group">
              <label class="fin-form-label">Till Number <span class="fin-required">*</span></label>
              <input type="text" id="sup-f-mp-till" class="fin-form-input" value="${v('mpesa_till_number')}" placeholder="e.g. 123456" inputmode="numeric">
            </div>
          </div>
        </div>

        <div class="fin-filter-section" id="sup-sec-send" style="display:none">
          <div class="fin-section-label">M-Pesa Send Money</div>
          <div class="fin-form-grid-2">
            <div class="fin-form-group">
              <label class="fin-form-label">Mobile Number <span class="fin-required">*</span></label>
              <input type="tel" id="sup-f-mp-send" class="fin-form-input" value="${v('mpesa_send_money_phone')}" placeholder="+254 7XX XXX XXX or 07XX XXX XXX">
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

  // Show the right fieldset for a pre-existing payment_mode on Edit
  _supTogglePayMode();
}

async function _supSubmit() {
  const statusEl = document.getElementById('sup-form-status');
  const name = document.getElementById('sup-f-name').value.trim();
  const errEl = document.getElementById('sup-f-name-err');

  errEl.textContent = name ? '' : 'Supplier name is required.';
  if (!name) return;

  const mode = document.getElementById('sup-f-pay-mode')?.value || '';
  const fiRaw = document.getElementById('sup-f-fi')?.value || '';
  const financial_institution_id = (mode === 'bank_transfer' && fiRaw && fiRaw !== '__other')
    ? parseInt(fiRaw, 10) : null;
  const bankNameOther = (mode === 'bank_transfer' && fiRaw === '__other')
    ? (document.getElementById('sup-f-bank-name')?.value.trim() || null) : null;

  const payload = {
    name,
    email:          document.getElementById('sup-f-email').value.trim()       || null,
    phone:          document.getElementById('sup-f-phone').value.trim()       || null,
    contact_person: document.getElementById('sup-f-contact').value.trim()     || null,
    kra_pin:        document.getElementById('sup-f-kra').value.trim()         || null,
    address:        document.getElementById('sup-f-address').value.trim()     || null,
    payment_terms:  document.getElementById('sup-f-payment-terms').value      || null,
    is_active:      document.getElementById('sup-f-active').checked,

    payment_mode:              mode || null,
    financial_institution_id,
    bank_name:                 bankNameOther,
    bank_branch:               mode === 'bank_transfer'
      ? (document.getElementById('sup-f-bank-branch')?.value.trim() || null) : null,
    bank_account_name:         mode === 'bank_transfer'
      ? (document.getElementById('sup-f-acct-name')?.value.trim()   || null) : null,
    bank_account_number:       mode === 'bank_transfer'
      ? (document.getElementById('sup-f-acct-no')?.value.trim()     || null) : null,
    mpesa_paybill_number:      mode === 'mpesa_paybill'
      ? (document.getElementById('sup-f-mp-paybill')?.value.trim()  || null) : null,
    mpesa_paybill_account:     mode === 'mpesa_paybill'
      ? (document.getElementById('sup-f-mp-paybill-acct')?.value.trim() || null) : null,
    mpesa_till_number:         mode === 'mpesa_till'
      ? (document.getElementById('sup-f-mp-till')?.value.trim()     || null) : null,
    mpesa_send_money_phone:    mode === 'mpesa_send_money'
      ? (document.getElementById('sup-f-mp-send')?.value.trim()     || null) : null,
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

// ==================== PROCUREMENT — REQUISITIONS ====================
// Confirmed live against openapi.json 2026-07-27: POST/GET /api/procurement/requisitions/,
// GET/PUT /api/procurement/requisitions/{id}, {id}/submit|cancel|pdf.
// {id}/approve and {id}/reject are gone as of 2026-08-10 — approval now
// routes exclusively through the Document Approval System (js/document-approvals.js).
// No JE at any stage — books move only when a downstream PV/Supplier Invoice is raised.

function _reqEsc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let _reqSuppliersCache = null;
let _reqStaffCache = null;
let _reqLines = [];

async function _reqEnsureSuppliersCache() {
  if (_reqSuppliersCache) return;
  const res = await apiFetch(`${API_BASE}/suppliers/`);
  _reqSuppliersCache = (res && res.ok) ? _toArray(await res.json()) : [];
}
async function _reqEnsureStaffCache() {
  if (_reqStaffCache) return;
  const res = await apiFetch(`${API_BASE}/hr/employees`);
  const raw = (res && res.ok) ? await res.json() : null;
  _reqStaffCache = raw ? (raw.items || _toArray(raw)) : [];
}
function _reqSupplierName(id) {
  const s = (_reqSuppliersCache||[]).find(x => String(x.id) === String(id));
  return s ? (s.name || `#${id}`) : `#${id}`;
}
function _reqSupplierOptionsHtml(selectedId) {
  return (_reqSuppliersCache||[]).map(s =>
    `<option value="${s.id}" ${String(s.id)===String(selectedId)?'selected':''}>${_reqEsc(s.name||'')}</option>`).join('');
}
function _reqStaffLabel(id) {
  const e = (_reqStaffCache||[]).find(x => String(x.id) === String(id));
  if (!e) return `#${id}`;
  return `${e.first_name||''} ${e.last_name||''}`.trim() || `#${id}`;
}

const _REQ_STATUS_COLORS = {
  draft:     'color:#666;background:#eee;',
  submitted: 'color:#fff;background:var(--navy-700,#1B3057);',
  approved:  'color:#1e7e34;background:#dcf3e2;',
  rejected:  'color:#c0392b;background:#fde0de;',
  cancelled: 'color:#888;background:#eee;text-decoration:line-through;',
};
function _reqStatusBadge(status) {
  const style = _REQ_STATUS_COLORS[status] || 'color:#666;background:#eee;';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;${style}">${_reqEsc((status||'').replace(/_/g,' ')||'—')}</span>`;
}

// ── Listing (split-view) ─────────────────────────────────────────────────────
async function loadRequisitionsView(container) {
  await Promise.all([_reqEnsureSuppliersCache(), _reqEnsureStaffCache()]);
  const cfg = {
    container,
    title: 'Requisitions',
    moduleKey: 'procurement',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Procurement',view:'procurement-requisitions'},
      {label:'Requisitions'},
    ],
    apiUrl: `${API_BASE}/procurement/requisitions/`,
    searchFields: ['requisition_no'],
    col1Label: 'Requisition', col2Label: 'Status',
    col1: r => `<strong>${_reqEsc(r.requisition_no||'—')}</strong><br><span style="font-weight:400;font-size:12px;color:#888;">${_reqEsc(_reqSupplierName(r.supplier_id))} &middot; ${r.requisition_date||''}</span>`,
    col2: r => `${_reqStatusBadge(r.status)}<br><span style="font-size:12px;color:#555;">${formatKES(r.total)}</span>`,
    rowLabel: r => r.requisition_no || '—',
    rowSub: r => `${(r.status||'').replace(/_/g,' ')} &middot; ${_reqEsc(_reqSupplierName(r.supplier_id))} &middot; ${r.requisition_date||''}`,
    idKey: 'id',
    detailFields: [
      {label:'Supplier',          key:'supplier_id', fmt:v=>_reqSupplierName(v)},
      {label:'KRA PIN',           key:'supplier_kra_pin_snapshot', fmt:v=>v||'(live PIN)'},
      {label:'Requisition Date', key:'requisition_date', fmt:v=>v||'—'},
    ],
    canEdit: item => item.status === 'draft',
    renderAdd: el => _reqRenderAddForm(el),
    renderEdit: (item, el) => _reqRenderEditForm(item, el),
    detailActions: item => _reqDetailActionsHtml(item),
  };
  await renderSplitView(cfg);
  _reqInjectFilters(cfg);
}

function _reqInjectFilters(cfg) {
  const searchBox = document.querySelector('.split-left-search');
  if (!searchBox) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap;';
  wrap.innerHTML = `
    <select id="req-filter-status" class="fin-form-select" style="flex:1;min-width:110px;font-size:12px;">
      <option value="">All Statuses</option>
      ${['draft','submitted','approved','rejected','cancelled'].map(s=>`<option value="${s}">${s[0].toUpperCase()+s.slice(1)}</option>`).join('')}
    </select>
    <select id="req-filter-supplier" class="fin-form-select" style="flex:1;min-width:130px;font-size:12px;">
      <option value="">All Suppliers</option>${_reqSupplierOptionsHtml(null)}
    </select>
    <input type="date" id="req-filter-start" class="fin-form-input" style="flex:1;min-width:110px;font-size:12px;" title="Start date">
    <input type="date" id="req-filter-end" class="fin-form-input" style="flex:1;min-width:110px;font-size:12px;" title="End date">`;
  searchBox.insertAdjacentElement('afterend', wrap);
  ['req-filter-status','req-filter-supplier','req-filter-start','req-filter-end'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => _reqReapplyFilters(cfg));
  });
}
function _reqReapplyFilters(cfg) {
  const status     = document.getElementById('req-filter-status')?.value || '';
  const supplierId  = document.getElementById('req-filter-supplier')?.value || '';
  const start       = document.getElementById('req-filter-start')?.value || '';
  const end         = document.getElementById('req-filter-end')?.value || '';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (supplierId) params.set('supplier_id', supplierId);
  if (start) params.set('start_date', start);
  if (end) params.set('end_date', end);
  const qs = params.toString();
  cfg.apiUrl = `${API_BASE}/procurement/requisitions/` + (qs ? `?${qs}` : '');
  window._splitReload && window._splitReload();
}

// ── Lines (mirrors js/journal-entries.js's debit/credit line pattern) ────────
// _reqUpdateLine deliberately updates only the affected net-amount cell + the
// footer totals, not the whole tbody — re-rendering every row on each
// keystroke would drop input focus/cursor position mid-type.
function _reqLineNet(line) {
  const qty = parseFloat(line.quantity) || 0;
  const price = parseFloat(line.unit_price) || 0;
  const gross = qty * price;
  const pctRaw = line.discount_pct;
  const amtRaw = line.discount_amount;
  if (pctRaw !== '' && pctRaw != null && !isNaN(parseFloat(pctRaw))) return gross * (1 - parseFloat(pctRaw) / 100);
  if (amtRaw !== '' && amtRaw != null && !isNaN(parseFloat(amtRaw))) return gross - Math.min(parseFloat(amtRaw), gross);
  return gross;
}
function _reqLineRowHtml(line, idx) {
  const net = _reqLineNet(line);
  return `
    <tr>
      <td><input type="text" class="fin-li-input" placeholder="Description" value="${_reqEsc(line.item_description||'')}" oninput="_reqUpdateLine(${idx},'item_description',this.value)"></td>
      <td><input type="number" class="fin-li-input" step="0.01" min="0.0001" style="width:80px;" value="${line.quantity||''}" oninput="_reqUpdateLine(${idx},'quantity',this.value)"></td>
      <td><input type="number" class="fin-li-input" step="0.01" min="0" style="width:100px;" value="${line.unit_price||''}" oninput="_reqUpdateLine(${idx},'unit_price',this.value)"></td>
      <td><input type="number" class="fin-li-input" step="0.01" min="0" max="100" style="width:80px;" value="${line.discount_pct||''}" oninput="_reqUpdateLine(${idx},'discount_pct',this.value)"></td>
      <td><input type="number" class="fin-li-input" step="0.01" min="0" style="width:90px;" value="${line.discount_amount||''}" oninput="_reqUpdateLine(${idx},'discount_amount',this.value)"></td>
      <td id="req-line-net-${idx}" style="text-align:right;font-size:12px;white-space:nowrap;">${formatKES(net)}</td>
      <td><button class="fin-btn-li-rm" ${_reqLines.length<=1?'disabled':''} onclick="_reqRemoveLine(${idx})">&times;</button></td>
    </tr>`;
}
function _reqRenderLines() {
  const el = document.getElementById('req-lines-body');
  if (el) el.innerHTML = _reqLines.map((l, i) => _reqLineRowHtml(l, i)).join('');
  _reqRecalcTotals();
}
function _reqAddLine() {
  _reqLines.push({ item_description:'', quantity:'', unit_price:'', discount_pct:'', discount_amount:'' });
  _reqRenderLines();
}
function _reqRemoveLine(idx) {
  if (_reqLines.length <= 1) return;
  _reqLines.splice(idx, 1);
  _reqRenderLines();
}
function _reqUpdateLine(idx, key, val) {
  _reqLines[idx][key] = val;
  const netCell = document.getElementById(`req-line-net-${idx}`);
  if (netCell) netCell.textContent = formatKES(_reqLineNet(_reqLines[idx]));
  _reqRecalcTotals();
}
function _reqRecalcTotals() {
  const subtotal = _reqLines.reduce((s, l) => s + _reqLineNet(l), 0);
  const pctInput = document.getElementById('req-f-header-disc-pct');
  const amtInput = document.getElementById('req-f-header-disc-amt');
  let headerDiscount = 0;
  if (pctInput && pctInput.value !== '' && !isNaN(parseFloat(pctInput.value))) {
    headerDiscount = subtotal * (parseFloat(pctInput.value) / 100);
  } else if (amtInput && amtInput.value !== '' && !isNaN(parseFloat(amtInput.value))) {
    headerDiscount = Math.min(parseFloat(amtInput.value), subtotal);
  }
  const total = Math.max(0, subtotal - headerDiscount);
  const subEl = document.getElementById('req-f-subtotal'); if (subEl) subEl.textContent = formatKES(subtotal);
  const discEl = document.getElementById('req-f-header-disc-total'); if (discEl) discEl.textContent = formatKES(headerDiscount);
  const totEl = document.getElementById('req-f-total'); if (totEl) totEl.textContent = formatKES(total);
}

// ── Shared header fields + lines table (single-column in the split-right-add
// pane, two-column in split-edit-fullscreen — same CSS context switch CoA and
// the other fin-form-grid-2 forms already rely on) ───────────────────────────
function _reqHeaderFieldsHtml(req) {
  const todayStr = new Date().toISOString().slice(0,10);
  return `
    <div class="fin-form-grid-2">
      <div class="fin-form-group">
        <label class="fin-form-label">Supplier <span class="fin-required">*</span></label>
        <select id="req-f-supplier" class="fin-form-select"><option value="">Please Select</option>${_reqSupplierOptionsHtml(req?.supplier_id)}</select>
        <span class="fin-field-error" id="req-f-supplier-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Requisition Date</label>
        <input type="date" id="req-f-date" class="fin-form-input" value="${req?.requisition_date || todayStr}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Header Discount %</label>
        <input type="number" id="req-f-header-disc-pct" class="fin-form-input" step="0.01" min="0" max="100" value="${req?.header_discount_pct ?? ''}" oninput="_reqRecalcTotals()">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Header Discount Amount</label>
        <input type="number" id="req-f-header-disc-amt" class="fin-form-input" step="0.01" min="0" value="${req?.header_discount_amount ?? ''}" oninput="_reqRecalcTotals()">
        <span class="fin-field-hint fin-field-hint-info">If both are set, percentage wins.</span>
      </div>
      <div class="fin-form-group fin-span-2">
        <label class="fin-form-label">Narration</label>
        <textarea id="req-f-notes" class="fin-form-textarea" rows="3" placeholder="What is this requisition for? The approver reads this before deciding.">${_reqEsc(req?.notes||'')}</textarea>
      </div>
    </div>`;
}
function _reqLinesTableHtml() {
  return `
    <div class="fin-section-label">Lines</div>
    <div class="fin-table-wrap">
      <table class="fin-li-table">
        <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Disc %</th><th>Disc Amt</th><th>Line Net</th><th></th></tr></thead>
        <tbody id="req-lines-body"></tbody>
      </table>
    </div>
    <button type="button" class="fin-btn-outline" style="margin-top:8px;" onclick="_reqAddLine()">+ Add Line</button>
    <div class="fin-info-grid" style="margin-top:16px;max-width:360px;margin-left:auto;">
      <div class="fin-info-item"><span class="fin-info-label">Subtotal</span><span class="fin-info-value" id="req-f-subtotal">${formatKES(0)}</span></div>
      <div class="fin-info-item"><span class="fin-info-label">Header Discount</span><span class="fin-info-value" id="req-f-header-disc-total">${formatKES(0)}</span></div>
      <div class="fin-info-item"><span class="fin-info-label">Total</span><span class="fin-info-value" id="req-f-total" style="font-weight:700;font-size:1.1rem;">${formatKES(0)}</span></div>
    </div>`;
}

function _reqCollectLinesPayload() {
  return _reqLines
    .filter(l => (l.item_description||'').trim() && parseFloat(l.quantity) > 0 && l.unit_price !== '')
    .map(l => ({
      item_description: l.item_description.trim(),
      quantity: parseFloat(l.quantity),
      unit_price: parseFloat(l.unit_price),
      discount_pct: (l.discount_pct !== '' && l.discount_pct != null) ? parseFloat(l.discount_pct) : null,
      discount_amount: (l.discount_amount !== '' && l.discount_amount != null) ? parseFloat(l.discount_amount) : null,
    }));
}
function _reqCollectHeaderPayload() {
  const pctVal = document.getElementById('req-f-header-disc-pct').value;
  const amtVal = document.getElementById('req-f-header-disc-amt').value;
  return {
    supplier_id: parseInt(document.getElementById('req-f-supplier').value),
    requisition_date: document.getElementById('req-f-date').value || null,
    header_discount_pct: pctVal !== '' ? parseFloat(pctVal) : null,
    header_discount_amount: amtVal !== '' ? parseFloat(amtVal) : null,
    notes: document.getElementById('req-f-notes').value.trim() || null,
  };
}

// ── Add (Save Draft only — no Submit button here; submit is a status
// transition triggered from the detail view after review) ───────────────────
function _reqRenderAddForm(el) {
  _reqLines = [{ item_description:'', quantity:'', unit_price:'', discount_pct:'', discount_amount:'' }];
  el.innerHTML = `
    <div class="fin-form-wrap" style="max-width:100%;">
      <h3 class="fin-title" style="font-size:1rem;">New Requisition</h3>
      <div class="fin-field-hint fin-field-hint-info">A requisition never posts a journal entry — books move only when a downstream Payment Voucher or Supplier Invoice is raised against it once approved.</div>
      ${_reqHeaderFieldsHtml(null)}
      ${_reqLinesTableHtml()}
      <div id="req-f-msg" style="margin-top:12px;"></div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_reqSubmitAdd()">Save Draft</button>
        <button class="fin-btn-cancel" onclick="window._splitReload && window._splitReload()">Cancel</button>
      </div>
    </div>`;
  _reqRenderLines();
}
async function _reqSubmitAdd() {
  document.getElementById('req-f-supplier-err').textContent = '';
  document.getElementById('req-f-msg').innerHTML = '';
  const supplierId = document.getElementById('req-f-supplier').value;
  if (!supplierId) { document.getElementById('req-f-supplier-err').textContent = 'This field is required.'; return; }
  const lines = _reqCollectLinesPayload();
  if (lines.length === 0) {
    document.getElementById('req-f-msg').innerHTML = `<div class="fin-field-error">Add at least one line with a description, quantity and unit price.</div>`;
    return;
  }
  const payload = { ..._reqCollectHeaderPayload(), lines };
  const res = await apiFetch(`${API_BASE}/procurement/requisitions/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (res && res.ok) {
    showToast('Requisition saved as draft.', 'success');
    window._splitReload && await window._splitReload();
    return;
  }
  if (!res) return;
  const detail = await parseApiError(res);
  if (res.status === 404 || (res.status === 400 && /inactive/i.test(detail))) {
    document.getElementById('req-f-supplier-err').textContent = detail;
  } else {
    document.getElementById('req-f-msg').innerHTML = `<div class="fin-field-error">${_reqEsc(detail)}</div>`;
  }
}

// ── Edit (draft only, PUT full-replace) ──────────────────────────────────────
function _reqRenderEditForm(item, el) {
  _reqLines = (item.lines||[]).map(l => ({
    item_description: l.item_description, quantity: l.quantity, unit_price: l.unit_price,
    discount_pct: l.discount_pct, discount_amount: l.discount_amount,
  }));
  if (_reqLines.length === 0) _reqLines = [{ item_description:'', quantity:'', unit_price:'', discount_pct:'', discount_amount:'' }];
  el.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Requisition ${_reqEsc(item.requisition_no||'')}</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Procurement &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('procurement-requisitions');return false;">Requisitions</a> &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:100%;">
        ${_reqHeaderFieldsHtml(item)}
        ${_reqLinesTableHtml()}
        <div id="req-f-msg" style="margin-top:12px;"></div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_reqSubmitEdit(${item.id})">Update</button>
          <button class="fin-btn-cancel" onclick="window._splitRefreshSelected && window._splitRefreshSelected()">Cancel</button>
        </div>
      </div>
    </div>`;
  _reqRenderLines();
}
async function _reqSubmitEdit(id) {
  document.getElementById('req-f-supplier-err').textContent = '';
  document.getElementById('req-f-msg').innerHTML = '';
  const supplierId = document.getElementById('req-f-supplier').value;
  if (!supplierId) { document.getElementById('req-f-supplier-err').textContent = 'This field is required.'; return; }
  const lines = _reqCollectLinesPayload();
  if (lines.length === 0) {
    document.getElementById('req-f-msg').innerHTML = `<div class="fin-field-error">Add at least one line with a description, quantity and unit price.</div>`;
    return;
  }
  const payload = { ..._reqCollectHeaderPayload(), lines };
  const res = await apiFetch(`${API_BASE}/procurement/requisitions/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (res && res.ok) {
    showToast('Requisition updated.', 'success');
    // The server refreshes supplier_kra_pin_snapshot from the current supplier
    // row on save — _splitRefreshSelected re-fetches the list so the detail
    // pane reflects that fresh value instead of the pre-edit cached PIN.
    window._splitRefreshSelected && await window._splitRefreshSelected();
    return;
  }
  if (!res) return;
  const detail = await parseApiError(res);
  if (res.status === 404) document.getElementById('req-f-supplier-err').textContent = detail;
  else document.getElementById('req-f-msg').innerHTML = `<div class="fin-field-error">${_reqEsc(detail)}</div>`;
}

// ── Detail-pane: stat cards, lines table, audit strip, lifecycle actions ─────
function _reqHeaderDiscountAmount(item) {
  const sub = parseFloat(item.subtotal) || 0;
  const tot = parseFloat(item.total) || 0;
  return sub - tot;
}
function _reqDetailActionsHtml(item) {
  window._reqCurrentItem = item;
  const statCards = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin:4px 0 16px;">
      <div style="flex:1;min-width:140px;background:var(--navy-700,#1B3057);color:#fff;border-radius:8px;padding:14px 16px;">
        <div style="font-size:11px;opacity:.75;text-transform:uppercase;letter-spacing:.05em;">Subtotal</div>
        <div style="font-size:1.15rem;font-weight:600;margin-top:4px;">${formatKES(item.subtotal)}</div>
      </div>
      <div style="flex:1;min-width:140px;background:var(--navy-700,#1B3057);color:#fff;border-radius:8px;padding:14px 16px;">
        <div style="font-size:11px;opacity:.75;text-transform:uppercase;letter-spacing:.05em;">Header Discount</div>
        <div style="font-size:1.15rem;font-weight:600;margin-top:4px;">${formatKES(_reqHeaderDiscountAmount(item))}</div>
      </div>
      <div style="flex:1.2;min-width:160px;background:var(--navy-700,#1B3057);color:#fff;border-radius:8px;padding:14px 16px;">
        <div style="font-size:11px;opacity:.75;text-transform:uppercase;letter-spacing:.05em;">Total</div>
        <div style="font-size:1.4rem;font-weight:700;margin-top:4px;">${formatKES(item.total)}</div>
      </div>
    </div>`;

  const lineRows = (item.lines||[]).map(l => `
    <tr>
      <td>${_reqEsc(l.item_description||'')}</td>
      <td>${parseFloat(l.quantity||0).toLocaleString(undefined,{maximumFractionDigits:2})}</td>
      <td>${formatKES(l.unit_price)}</td>
      <td>${l.discount_pct ? parseFloat(l.discount_pct).toFixed(2)+'%' : '—'}</td>
      <td>${l.discount_amount ? formatKES(l.discount_amount) : '—'}</td>
      <td>${formatKES(l.line_net)}</td>
    </tr>`).join('') || `<tr><td colspan="6" class="fin-empty">No lines.</td></tr>`;
  const linesTable = `
    <div class="fin-section-label">Lines</div>
    <div class="fin-table-wrap"><table class="fin-li-table">
      <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Disc %</th><th>Disc Amt</th><th>Line Net</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table></div>`;

  const auditStrip = `
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--grey-100);font-size:0.82rem;color:#666;display:flex;gap:24px;flex-wrap:wrap;">
      <span>Submitted By: ${item.submitted_by ? _reqEsc(_reqStaffLabel(item.submitted_by)) : '—'}</span>
      <span>Submitted At: ${item.submitted_at ? new Date(item.submitted_at).toLocaleString() : '—'}</span>
      <span>Approved By: ${item.approved_by ? _reqEsc(_reqStaffLabel(item.approved_by)) : '—'}</span>
      <span>Approved At: ${item.approved_at ? new Date(item.approved_at).toLocaleString() : '—'}</span>
      ${item.status === 'rejected' ? `<span style="color:var(--coral-600,#B03030);">Rejection Reason: ${_reqEsc(item.rejection_reason||'')}</span>` : ''}
    </div>`;

  // Narration — surfaced as its own callout, escaped and line-break-preserving
  // (the generic detail-fields grid neither escapes nor preserves line breaks,
  // which mangled anything longer than a short phrase), and positioned right
  // before the Approve/Reject decision so the approver reads it last.
  const narrationBlock = item.notes ? `
    <div style="margin-top:14px;padding:12px 16px;background:var(--navy-50,#EEF3FA);border-left:3px solid var(--navy-400,#4A6FA5);border-radius:6px;">
      <div style="font-size:11px;font-weight:600;color:var(--navy-700,#1B3057);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Narration</div>
      <div style="font-size:0.88rem;color:#333;white-space:pre-wrap;">${_reqEsc(item.notes)}</div>
    </div>` : '';

  const dasBanner = item.status === 'submitted' ? `
    <div style="background:var(--navy-50,#EEF3FA);border:1px solid var(--navy-100,#DCE6F5);border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:0.86rem;color:var(--navy-700,#1B3057);">
      This requisition is awaiting approval in the Document Approval System.
      <br><a href="#" onclick="openDasQueueForType('requisition');return false;" style="color:var(--navy-700,#1B3057);font-weight:600;text-decoration:underline;">&rarr; Open the DAS queue</a>
    </div>` : '';

  let actions = '';
  if (item.status === 'draft') {
    actions += `<button class="fin-btn-teal" onclick="_reqSubmitForApproval(${item.id})">Submit to DAS</button>`;
    actions += `<button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_reqCancel(${item.id})">Cancel Requisition</button>`;
  }
  actions += `<button class="fin-btn-outline" onclick="_reqDownloadPdf(${item.id})">Download PDF</button>`;

  return `
    ${statCards}
    ${linesTable}
    ${auditStrip}
    ${narrationBlock}
    ${dasBanner}
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;align-items:center;">${actions}</div>
    <div id="req-action-msg-${item.id}" style="margin-top:8px;"></div>`;
}

// ── Lifecycle transitions ────────────────────────────────────────────────────
async function _reqHandleLifecycleResult(res, id, successMsg) {
  if (res && res.ok) {
    showToast(successMsg, 'success');
    window._splitRefreshSelected && await window._splitRefreshSelected();
    return;
  }
  if (!res) return;
  const detail = await parseApiError(res);
  const el = document.getElementById(`req-action-msg-${id}`);
  if (el) el.innerHTML = `<div class="fin-field-error">${_reqEsc(detail)}</div>`; else showToast(detail, 'error');
}
async function _reqSubmitForApproval(id) {
  const res = await apiFetch(`${API_BASE}/procurement/requisitions/${id}/submit`, { method: 'POST' });
  await _reqHandleLifecycleResult(res, id, 'Requisition submitted for approval.');
}
async function _reqCancel(id) {
  if (!confirm('Cancel this requisition? This cannot be undone.')) return;
  const res = await apiFetch(`${API_BASE}/procurement/requisitions/${id}/cancel`, { method: 'POST' });
  await _reqHandleLifecycleResult(res, id, 'Requisition cancelled.');
}

// ── PDF — authenticated blob download via the shared ui-helpers.js helper ───
async function _reqDownloadPdf(id) {
  // Surface the backend detail (e.g. WeasyPrint failure on Render) instead of
  // a generic toast — matches the diagnostic pattern used for the
  // requisition list load in dashboard.js.
  await authBlobDownload(`${API_BASE}/procurement/requisitions/${id}/pdf`, `requisition-${id}.pdf`, {
    errorPrefix: 'Could not download the PDF: ',
  });
}
