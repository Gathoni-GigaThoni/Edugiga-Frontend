// ==================== RECEIVABLES MODULE ====================
// Modules: Fee Schedules (1), Fee Setup by Class (2),
//          Student Fee Assignments (3), Fee Invoices (4), Bulk Invoice Generate (5)

// ── Close-dropdown on document click ─────────────────────
document.addEventListener('click', () => {
  document.querySelectorAll('[id^="rcv-fs-dd-"],[id^="rcv-asn-dd-"],[id^="rcv-inv-dd-"]')
    .forEach(d => d.style.display = 'none');
});

// ── Shared caches ─────────────────────────────────────────
let _rcvFeeItemsCache  = null;
let _rcvTermsCache     = null;
let _rcvLevelsCache    = null;
let _rcvClassesCache   = null;
let _rcvRoutesCache    = null;
let _rcvAccountsCache  = null;
let _rcvLedgersCache   = null;
let _rcvStudentsCache  = null;

async function _rcvLoadLookups({ items=false, terms=false, levels=false, classes=false, routes=false, accounts=false, ledgers=false, students=false } = {}) {
  const reqs = [];
  if (items    && !_rcvFeeItemsCache)  reqs.push(apiFetch(`${API_BASE}/finance/fee-items`).then(r => r&&r.ok ? r.json() : []).then(d => { _rcvFeeItemsCache  = _toArray(d); }));
  if (terms    && !_rcvTermsCache)     reqs.push(apiFetch(`${API_BASE}/terms`).then(r => r&&r.ok ? r.json() : []).then(d => { _rcvTermsCache     = _toArray(d); }));
  if (levels   && !_rcvLevelsCache)    reqs.push(apiFetch(`${API_BASE}/academic-levels/`).then(r => r&&r.ok ? r.json() : []).then(d => { _rcvLevelsCache    = _toArray(d); }));
  if (classes  && !_rcvClassesCache)   reqs.push(apiFetch(`${API_BASE}/classes/`).then(r => r&&r.ok ? r.json() : []).then(d => { _rcvClassesCache   = _toArray(d); }));
  if (routes   && !_rcvRoutesCache)    reqs.push(apiFetch(`${API_BASE}/routes/`).then(r => r&&r.ok ? r.json() : []).then(d => { _rcvRoutesCache    = _toArray(d); }));
  if (accounts && !_rcvAccountsCache)  reqs.push(apiFetch(`${API_BASE}/accounts/`).then(r => r&&r.ok ? r.json() : []).then(d => { _rcvAccountsCache  = _toArray(d); }));
  if (ledgers  && !_rcvLedgersCache)   reqs.push(apiFetch(`${API_BASE}/lookups/ledgers`).then(r => r&&r.ok ? r.json() : []).then(d => { _rcvLedgersCache   = _toArray(d); }));
  if (students && !_rcvStudentsCache)  reqs.push(apiFetch(`${API_BASE}/students/`).then(r => r&&r.ok ? r.json() : []).then(d => { _rcvStudentsCache  = _toArray(d); }));
  await Promise.all(reqs);
}

function _rcvFeeItemName(id) {
  const f = (_rcvFeeItemsCache||[]).find(x => String(x.id) === String(id));
  return f ? (f.name || '-') : (id ? `#${id}` : '-');
}
function _rcvTermName(id) {
  const t = (_rcvTermsCache||[]).find(x => String(x.id) === String(id));
  return t ? (t.title || t.name || '-') : (id ? `Term ${id}` : '—');
}
function _rcvLevelName(id) {
  const l = (_rcvLevelsCache||[]).find(x => String(x.id) === String(id));
  return l ? (l.name || '-') : (id ? `#${id}` : '—');
}
function _rcvClassName(id) {
  const c = (_rcvClassesCache||[]).find(x => String(x.id) === String(id));
  return c ? (c.name || c.class_name || '-') : (id ? `#${id}` : '—');
}
function _rcvStudentName(id) {
  const s = (_rcvStudentsCache||[]).find(x => String(x.id) === String(id));
  return s ? `${s.first_name||''} ${s.last_name||''}`.trim() || `#${id}` : (id ? `#${id}` : '—');
}
function _rcvRouteName(id) {
  const r = (_rcvRoutesCache||[]).find(x => String(x.id) === String(id));
  return r ? (r.name || r.route_name || '-') : (id ? `Route #${id}` : '—');
}

const _RCV_SCOPE_BADGE_STYLES = {
  academic_level:  'background:#dce8fb;color:#1a5fb4',
  class:           'background:#e0e0ff;color:#3730a3',
  route_direction: 'background:#fef3c7;color:#92400e',
  activity:        'background:#d1fae5;color:#065f46',
  meal_plan:       'background:#ccfbf1;color:#0f766e',
  global:          'background:#f3f4f6;color:#374151',
  student:         'background:#f3e8ff;color:#7e22ce',
};
function _rcvScopeBadge(scopeType) {
  const style = _RCV_SCOPE_BADGE_STYLES[scopeType] || 'background:#f3f4f6;color:#374151';
  const label = (scopeType||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:600;${style}">${_finEsc(label)}</span>`;
}
function _rcvScopeTarget(s) {
  switch (s.scope_type) {
    case 'academic_level': return _finEsc(_rcvLevelName(s.academic_level_id));
    case 'class':          return _finEsc(_rcvClassName(s.class_id));
    case 'global':
    case 'meal_plan':      return '—';
    case 'student':        return _finEsc(_rcvStudentName(s.student_id || s.scope_id));
    case 'route_direction':return _finEsc(`${_rcvRouteName(s.route_id || s.scope_id)} · ${s.direction || ''}`);
    case 'activity':       return _finEsc(_rcvFeeItemName(s.scope_id) || `#${s.scope_id}`);
    default:               return s.scope_id ? `#${s.scope_id}` : '—';
  }
}

function _rcvCloseModal() { document.getElementById('fin-gen-modal-overlay')?.remove(); }

function _rcvAccountOptions(filterType, selectedId) {
  return (_rcvAccountsCache||[])
    .filter(a => !filterType || (a.account_type||'').toLowerCase() === filterType.toLowerCase())
    .map(a => `<option value="${a.id}" ${String(a.id)===String(selectedId)?'selected':''}>${_finEsc(a.number||'')} — ${_finEsc(a.account_name||'')}</option>`)
    .join('');
}
function _rcvLedgerOptions(selectedId) {
  return (_rcvLedgersCache||[]).map(l => `<option value="${l.id}" ${String(l.id)===String(selectedId)?'selected':''}>${_finEsc(l.name||l.title||`Ledger ${l.id}`)}</option>`).join('');
}
function _rcvTermOptions(selectedId) {
  return (_rcvTermsCache||[]).map(t => `<option value="${t.id}" ${String(t.id)===String(selectedId)?'selected':''}>${_finEsc(t.title||t.name||'')}</option>`).join('');
}
function _rcvFeeItemOptions(selectedId) {
  return (_rcvFeeItemsCache||[]).map(f => `<option value="${f.id}" ${String(f.id)===String(selectedId)?'selected':''}>${_finEsc(f.name||'')}</option>`).join('');
}
function _rcvLevelOptions(selectedId) {
  return (_rcvLevelsCache||[]).map(l => `<option value="${l.id}" ${String(l.id)===String(selectedId)?'selected':''}>${_finEsc(l.name||'')}</option>`).join('');
}
function _rcvClassOptions(selectedId, filteredClasses) {
  return (filteredClasses || _rcvClassesCache||[]).map(c => `<option value="${c.id}" ${String(c.id)===String(selectedId)?'selected':''}>${_finEsc(c.name||c.class_name||'')}</option>`).join('');
}
function _rcvRouteOptions(selectedId) {
  return (_rcvRoutesCache||[]).map(r => `<option value="${r.id}" ${String(r.id)===String(selectedId)?'selected':''}>${_finEsc(r.name||r.route_name||'')}</option>`).join('');
}

// ==================== MODULE 1 — FEE SCHEDULES ====================
let rcvFeeSchedulesData = [];
let _rcvFsPage=1, _rcvFsPerPage=25, _rcvFsFilterScope='', _rcvFsFilterItem='', _rcvFsFilterTerm='';

async function loadFeeSchedulesView(container) {
  await _rcvLoadLookups({ items:true, terms:true, levels:true, classes:true, routes:true });
  await renderSplitView({
    container,
    title: 'Fee Schedules',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Finance',view:'fin-fee-schedules'},
      {label:'Fee Schedules'}
    ],
    apiUrl: `${API_BASE}/receivables/setup/fee-schedules`,
    searchFields: ['scope_type'],
    col1Label: 'Fee Item', col2Label: 'Scope',
    col1: s => _rcvFeeItemName(s.fee_item_id) || '—',
    col2: s => s.scope_type || '—',
    rowLabel: s => _rcvFeeItemName(s.fee_item_id) || '—',
    rowSub:   s => s.scope_type || '',
    idKey: 'id',
    detailFields: [
      {label:'Fee Item',  key:'fee_item_id', fmt:v=>_rcvFeeItemName(v)},
      {label:'Scope',     key:'scope_type', fmt:v=>v||'—'},
      {label:'Term',      key:'term_id', fmt:v=>v?_rcvTermName(v):'All Terms'},
      {label:'Amount',    key:'amount', fmt:v=>`KES ${_finFmt(v)}`},
    ],
    onAdd:  () => openFeeScheduleModal(),
    onEdit: item => { rcvFeeSchedulesData = [item]; openFeeScheduleModal(item.id); },
  });
}

function _rcvRenderFsListPage(container) {
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Fee Schedules</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Fee Schedules &rsaquo; Listing</div>
      </div>
      <div class="fin-filter-section">
        <div class="fin-filter-grid">
          <div class="fin-filter-field">
            <label class="fin-filter-label">Scope Type</label>
            <select id="rcv-fs-filter-scope" class="fin-filter-select" onchange="rcvFsApplyFilter()">
              <option value="">All</option>
              <option value="academic_level">Academic Level</option>
              <option value="class">Class</option>
              <option value="route_direction">Route Direction</option>
              <option value="activity">Activity</option>
              <option value="meal_plan">Meal Plan</option>
              <option value="global">Global</option>
              <option value="student">Student</option>
            </select>
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Fee Item</label>
            <select id="rcv-fs-filter-item" class="fin-filter-select" onchange="rcvFsApplyFilter()">
              <option value="">All</option>
            </select>
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Term</label>
            <select id="rcv-fs-filter-term" class="fin-filter-select" onchange="rcvFsApplyFilter()">
              <option value="">All</option>
            </select>
          </div>
        </div>
        <div class="fin-filter-actions">
          <button class="fin-btn-outline" onclick="rcvFsClearFilter()">Clear</button>
        </div>
      </div>
      <div class="fin-controls-row">
        <div class="fin-controls-left">
          Total <span id="rcv-fs-total">0</span> entries
        </div>
        <div class="fin-controls-right">
          <button class="fin-btn-teal" onclick="openFeeScheduleModal()">+ Add Fee Schedule</button>
        </div>
      </div>
      <div id="rcv-fs-table-container"></div>
      <div id="rcv-fs-pagination"></div>
    </div>`;
}

function _rcvRenderFsFilters() {
  const itemSel = document.getElementById('rcv-fs-filter-item');
  const termSel = document.getElementById('rcv-fs-filter-term');
  if (itemSel) itemSel.innerHTML = `<option value="">All</option>` + _rcvFeeItemOptions('');
  if (termSel) termSel.innerHTML = `<option value="">All</option>` + _rcvTermOptions('');
}

function rcvFsApplyFilter() {
  _rcvFsFilterScope = document.getElementById('rcv-fs-filter-scope')?.value || '';
  _rcvFsFilterItem  = document.getElementById('rcv-fs-filter-item')?.value  || '';
  _rcvFsFilterTerm  = document.getElementById('rcv-fs-filter-term')?.value  || '';
  _rcvFsPage = 1;
  _rcvRenderFsTable();
}
function rcvFsClearFilter() {
  _rcvFsFilterScope=''; _rcvFsFilterItem=''; _rcvFsFilterTerm=''; _rcvFsPage=1;
  ['rcv-fs-filter-scope','rcv-fs-filter-item','rcv-fs-filter-term'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  _rcvRenderFsTable();
}

function _rcvFsFiltered() {
  return rcvFeeSchedulesData.filter(s =>
    (!_rcvFsFilterScope || s.scope_type === _rcvFsFilterScope) &&
    (!_rcvFsFilterItem  || String(s.fee_item_id) === _rcvFsFilterItem) &&
    (!_rcvFsFilterTerm  || String(s.term_id) === _rcvFsFilterTerm || (!s.term_id && _rcvFsFilterTerm==='')));
}

function _rcvRenderFsTable() {
  const filtered = _rcvFsFiltered();
  const el = document.getElementById('rcv-fs-table-container');
  const totEl = document.getElementById('rcv-fs-total');
  if (totEl) totEl.textContent = filtered.length;
  if (!el) return;
  const start = (_rcvFsPage-1)*_rcvFsPerPage;
  const paged = filtered.slice(start, start+_rcvFsPerPage);
  const rows = paged.length ? paged.map(s=>`<tr>
      <td>${_finEsc(_rcvFeeItemName(s.fee_item_id))}</td>
      <td>${_rcvScopeBadge(s.scope_type)}</td>
      <td>${_rcvScopeTarget(s)}</td>
      <td>${_finEsc(_rcvTermName(s.term_id))}</td>
      <td>KES ${_finFmt(s.amount)}</td>
      <td class="fin-action-cell">
        <div class="fin-action-wrap">
          <button class="fin-action-btn" onclick="_pvToggleDropdown(event,'rcv-fs','${s.id}')">&#8230;</button>
          <div id="rcv-fs-dd-${s.id}" class="fin-action-dropdown" style="display:none;">
            <a href="#" onclick="openFeeScheduleModal(${s.id});return false;">&#9998; Edit</a>
            <a href="#" onclick="deleteFeeSchedule(${s.id});return false;">&#128465; Delete</a>
          </div>
        </div>
      </td>
    </tr>`).join('')
    : `<tr><td colspan="6" class="fin-empty">No fee schedules found.</td></tr>`;
  el.innerHTML = `<div class="fin-table-wrap"><table class="fin-table"><thead><tr>
    <th>FEE ITEM</th><th>SCOPE TYPE</th><th>SCOPE TARGET</th><th>TERM</th><th>AMOUNT</th><th>ACTION</th>
  </tr></thead><tbody>${rows}</tbody></table></div>`;
  const pages=Math.max(1,Math.ceil(filtered.length/_rcvFsPerPage));
  let pg=''; for(let i=1;i<=pages;i++) pg+=`<button class="${i===_rcvFsPage?'fin-pg-active':''}" onclick="_rcvFsPage=${i};_rcvRenderFsTable()">${i}</button>`;
  const pgEl=document.getElementById('rcv-fs-pagination');
  if(pgEl) pgEl.innerHTML=`<div class="fin-pagination">${pg}</div>`;
}

async function openFeeScheduleModal(editId) {
  _rcvCloseModal();
  await _rcvLoadLookups({ items:true, terms:true, levels:true, classes:true, routes:true });
  const s = editId ? rcvFeeSchedulesData.find(x=>String(x.id)===String(editId)) : null;
  const overlay = document.createElement('div');
  overlay.id = 'fin-gen-modal-overlay';
  overlay.style = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:1000;overflow-y:auto;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:8px;padding:28px;max-width:520px;width:92%;max-height:90vh;overflow-y:auto;">
      <h3 style="margin-top:0;">${s ? 'Edit' : 'Add'} Fee Schedule</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Scope Type <span class="fin-required">*</span></label>
        <select id="rcv-fs-scope-type" class="fin-form-select" onchange="_rcvScopeTypeChange(this.value)" ${s?'disabled':''}>
          <option value="">Please Select</option>
          <option value="academic_level" ${s?.scope_type==='academic_level'?'selected':''}>Academic Level</option>
          <option value="class"          ${s?.scope_type==='class'?'selected':''}>Class</option>
          <option value="route_direction"${s?.scope_type==='route_direction'?'selected':''}>Route Direction</option>
          <option value="activity"       ${s?.scope_type==='activity'?'selected':''}>Activity (ECA)</option>
          <option value="meal_plan"      ${s?.scope_type==='meal_plan'?'selected':''}>Meal Plan</option>
          <option value="global"         ${s?.scope_type==='global'?'selected':''}>Global</option>
          <option value="student"        ${s?.scope_type==='student'?'selected':''}>Student</option>
        </select>
        <span class="fin-field-error" id="rcv-fs-scope-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Fee Item <span class="fin-required">*</span></label>
        <select id="rcv-fs-fee-item" class="fin-form-select">
          <option value="">Please Select</option>
          ${_rcvFeeItemOptions(s?.fee_item_id)}
        </select>
        <span class="fin-field-error" id="rcv-fs-item-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Amount (KES) <span class="fin-required">*</span></label>
        <input type="number" id="rcv-fs-amount" class="fin-form-input" step="0.01" min="0" value="${s?.amount??''}">
        <span class="fin-field-error" id="rcv-fs-amount-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Term <small style="color:#888;">(leave blank to apply every term)</small></label>
        <select id="rcv-fs-term" class="fin-form-select">
          <option value="">— Every Term —</option>
          ${_rcvTermOptions(s?.term_id)}
        </select>
      </div>
      <!-- Conditional scope fields -->
      <div id="rcv-fs-scope-academic-level" class="fin-form-group" style="display:none;">
        <label class="fin-form-label">Academic Level <span class="fin-required">*</span></label>
        <select id="rcv-fs-level" class="fin-form-select">
          <option value="">Please Select</option>${_rcvLevelOptions(s?.academic_level_id)}
        </select>
      </div>
      <div id="rcv-fs-scope-class" class="fin-form-group" style="display:none;">
        <label class="fin-form-label">Class <span class="fin-required">*</span></label>
        <select id="rcv-fs-class" class="fin-form-select">
          <option value="">Please Select</option>${_rcvClassOptions(s?.class_id)}
        </select>
      </div>
      <div id="rcv-fs-scope-route-direction" style="display:none;">
        <div class="fin-form-group">
          <label class="fin-form-label">Route <span class="fin-required">*</span></label>
          <select id="rcv-fs-route" class="fin-form-select" onchange="rcvRouteSelected(this.value)">
            <option value="">Please Select</option>${_rcvRouteOptions(s?.route_id)}
          </select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Direction <span class="fin-required">*</span></label>
          <select id="rcv-fs-direction" class="fin-form-select">
            <option value="">Please Select</option>
            <option value="ONE_WAY_MORNING" ${s?.direction==='ONE_WAY_MORNING'?'selected':''}>One Way (Morning)</option>
            <option value="ONE_WAY_EVENING" ${s?.direction==='ONE_WAY_EVENING'?'selected':''}>One Way (Evening)</option>
            <option value="TWO_WAY"         ${s?.direction==='TWO_WAY'?'selected':''}>Two Way</option>
          </select>
        </div>
      </div>
      <div id="rcv-fs-scope-activity" class="fin-form-group" style="display:none;">
        <label class="fin-form-label">ECA Activity <span class="fin-required">*</span></label>
        <select id="rcv-fs-activity" class="fin-form-select">
          <option value="">Please Select</option>
          ${(_rcvFeeItemsCache||[]).filter(f=>f.is_extra_curricular).map(f=>`<option value="${f.id}" ${String(f.id)===String(s?.scope_id)?'selected':''}>${_finEsc(f.name||'')}</option>`).join('')}
        </select>
      </div>
      <div id="rcv-fs-scope-student" class="fin-form-group" style="display:none;">
        <label class="fin-form-label">Student ID <span class="fin-required">*</span></label>
        <input type="number" id="rcv-fs-student-id" class="fin-form-input" placeholder="Student ID" value="${s?.student_id||s?.scope_id||''}">
      </div>
      ${s ? `<p style="font-size:0.83rem;color:#888;margin-top:4px;"><em>Scope type cannot be changed. Delete and recreate if you need a different scope.</em></p>` : ''}
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="submitFeeScheduleForm(${s?s.id:'null'})">${s?'Update':'Submit'}</button>
        <button class="fin-btn-cancel" onclick="_rcvCloseModal()">Cancel</button>
        ${s ? `<button class="btn-danger" style="margin-left:auto" onclick="deleteFeeSchedule(${s.id})">&#128465; Delete</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (s?.scope_type) _rcvScopeTypeChange(s.scope_type);
}

function _rcvScopeTypeChange(val) {
  ['academic-level','class','route-direction','activity','student'].forEach(t => {
    const el = document.getElementById(`rcv-fs-scope-${t}`);
    if (el) el.style.display = 'none';
  });
  if (val && val !== 'global' && val !== 'meal_plan') {
    const el = document.getElementById(`rcv-fs-scope-${val.replace('_','-')}`);
    if (el) el.style.display = '';
  }
}

async function rcvRouteSelected(routeId) {
  if (!routeId) return;
  const res = await apiFetch(`${API_BASE}/routes/${routeId}/pricing`);
  if (!res || !res.ok) return;
  const pricings = _toArray(await res.json());
  const dirSel = document.getElementById('rcv-fs-direction');
  if (!dirSel) return;
  dirSel.innerHTML = '<option value="">Please Select</option>' + pricings.map(p=>`<option value="${p.id}" data-direction="${p.direction||''}">${_finEsc(p.direction||'')} — KES ${_finFmt(p.price||p.amount||0)}</option>`).join('');
}

async function submitFeeScheduleForm(editId) {
  const scopeType = document.getElementById('rcv-fs-scope-type')?.value;
  const feeItemId = document.getElementById('rcv-fs-fee-item')?.value;
  const amount    = document.getElementById('rcv-fs-amount')?.value;
  const termId    = document.getElementById('rcv-fs-term')?.value;
  let valid = true;
  const setErr = (id, msg) => { const e=document.getElementById(id); if(e) e.textContent=msg; if(msg) valid=false; };
  setErr('rcv-fs-scope-err',  !scopeType ? 'Scope type is required.' : '');
  setErr('rcv-fs-item-err',   !feeItemId ? 'Fee item is required.'   : '');
  setErr('rcv-fs-amount-err', (!amount||isNaN(parseFloat(amount))) ? 'Amount is required.' : '');
  if (!valid) return;

  const payload = {
    fee_item_id: parseInt(feeItemId, 10),
    scope_type:  scopeType,
    amount:      parseFloat(amount),
    term_id:     termId ? parseInt(termId, 10) : null,
  };

  switch (scopeType) {
    case 'academic_level': {
      const lvl = document.getElementById('rcv-fs-level')?.value;
      if (!lvl) { showToast('Please select an Academic Level.', 'error'); return; }
      payload.academic_level_id = parseInt(lvl, 10); break;
    }
    case 'class': {
      const cls = document.getElementById('rcv-fs-class')?.value;
      if (!cls) { showToast('Please select a Class.', 'error'); return; }
      payload.class_id = parseInt(cls, 10); break;
    }
    case 'route_direction': {
      const dir = document.getElementById('rcv-fs-direction')?.value;
      if (!dir) { showToast('Please select a Route and Direction.', 'error'); return; }
      payload.scope_id = parseInt(dir, 10);
      const selOpt = document.getElementById('rcv-fs-direction')?.selectedOptions[0];
      payload.direction = selOpt?.dataset.direction || '';
      break;
    }
    case 'activity': {
      const act = document.getElementById('rcv-fs-activity')?.value;
      if (!act) { showToast('Please select an ECA Activity.', 'error'); return; }
      payload.scope_id = parseInt(act, 10); break;
    }
    case 'student': {
      const sid = document.getElementById('rcv-fs-student-id')?.value;
      if (!sid) { showToast('Please enter a Student ID.', 'error'); return; }
      payload.student_id = parseInt(sid, 10); break;
    }
  }

  const isEdit = !!editId;
  const url = isEdit ? `${API_BASE}/receivables/setup/fee-schedules/${editId}` : `${API_BASE}/receivables/setup/fee-schedules`;
  const res = await apiFetch(url, {
    method: isEdit ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res && res.ok) {
    showToast(isEdit ? 'Schedule updated.' : 'Schedule created.', 'success');
    _rcvCloseModal();
    loadView('fin-fee-schedules');
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

async function deleteFeeSchedule(id) {
  if (!confirm('Delete this fee schedule? This cannot be undone.')) return;
  const res = await apiFetch(`${API_BASE}/receivables/setup/fee-schedules/${id}`, { method: 'DELETE' });
  if (res && (res.ok || res.status === 204)) {
    showToast('Schedule deleted.', 'success');
    rcvFeeSchedulesData = rcvFeeSchedulesData.filter(s=>String(s.id)!==String(id));
    _rcvCloseModal();
    _rcvRenderFsTable();
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

// ==================== MODULE 2 — FEE SETUP BY CLASS ====================
let _rcvFscSchedules = [];
let _rcvFscTermId = '', _rcvFscLevelId = '', _rcvFscClassId = '';

async function loadFeeSetupByClassView(container) {
  _rcvFscTermId=''; _rcvFscLevelId=''; _rcvFscClassId=''; _rcvFscSchedules=[];
  await _rcvLoadLookups({ terms:true, levels:true, classes:true, items:true });
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Fee Setup by Class</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Fee Setup by Class</div>
      </div>
      <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;">
        <!-- Left: Cascade selector -->
        <div style="min-width:220px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;flex-shrink:0;">
          <p style="font-weight:600;margin:0 0 12px;font-size:0.9rem;">Select Class</p>
          <div class="fin-form-group">
            <label class="fin-form-label">Term</label>
            <select id="fsc-term" class="fin-form-select" onchange="rcvFscOnTermChange(this.value)">
              <option value="">Please Select</option>${_rcvTermOptions('')}
            </select>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Academic Level</label>
            <select id="fsc-level" class="fin-form-select" onchange="rcvFscOnLevelChange(this.value)" disabled>
              <option value="">— Select Term first —</option>
            </select>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Class</label>
            <select id="fsc-class" class="fin-form-select" onchange="rcvFscOnClassChange(this.value)" disabled>
              <option value="">— Select Level first —</option>
            </select>
          </div>
        </div>
        <!-- Right: Schedules for selected class -->
        <div style="flex:1;min-width:0;">
          <div id="fsc-right-panel">
            <p style="color:#888;padding:20px 0;">Select a class on the left to view its fee schedules.</p>
          </div>
        </div>
      </div>
    </div>`;
}

function rcvFscOnTermChange(termId) {
  _rcvFscTermId = termId; _rcvFscLevelId=''; _rcvFscClassId=''; _rcvFscSchedules=[];
  const levelSel = document.getElementById('fsc-level');
  const classSel = document.getElementById('fsc-class');
  if (levelSel) { levelSel.innerHTML = `<option value="">Please Select</option>${_rcvLevelOptions('')}`; levelSel.disabled = !termId; }
  if (classSel) { classSel.innerHTML = '<option value="">— Select Level first —</option>'; classSel.disabled = true; }
  document.getElementById('fsc-right-panel').innerHTML = '<p style="color:#888;padding:20px 0;">Select a class on the left to view its fee schedules.</p>';
}

function rcvFscOnLevelChange(levelId) {
  _rcvFscLevelId = levelId; _rcvFscClassId=''; _rcvFscSchedules=[];
  const classSel = document.getElementById('fsc-class');
  if (!classSel) return;
  const filtered = (_rcvClassesCache||[]).filter(c => String(c.academic_level_id||c.level_id||'') === String(levelId));
  classSel.innerHTML = `<option value="">Please Select</option>${_rcvClassOptions('', filtered.length ? filtered : _rcvClassesCache)}`;
  classSel.disabled = !levelId;
  document.getElementById('fsc-right-panel').innerHTML = '<p style="color:#888;padding:20px 0;">Select a class on the left to view its fee schedules.</p>';
}

async function rcvFscOnClassChange(classId) {
  _rcvFscClassId = classId;
  const panel = document.getElementById('fsc-right-panel');
  if (!classId) { panel.innerHTML = '<p style="color:#888;padding:20px 0;">Select a class on the left to view its fee schedules.</p>'; return; }
  panel.innerHTML = '<p style="color:#888;padding:20px 0;">Loading&#8230;</p>';
  const url = `${API_BASE}/receivables/setup/fee-setup-per-class?class_id=${classId}${_rcvFscTermId?`&term_id=${_rcvFscTermId}`:''}`;
  const res = await apiFetch(url);
  _rcvFscSchedules = (res && res.ok) ? _toArray(await res.json()) : [];
  _rcvRenderFscPanel(panel);
}

function _rcvRenderFscPanel(panel) {
  const className = _rcvClassName(_rcvFscClassId);
  const rows = _rcvFscSchedules.length ? _rcvFscSchedules.map(s => `<tr>
    <td>${_finEsc(_rcvFeeItemName(s.fee_item_id))}</td>
    <td>KES ${_finFmt(s.amount)}</td>
    <td>${_finEsc(_rcvTermName(s.term_id))}</td>
    <td><span title="Students enrolling in this class are assigned this fee automatically." style="cursor:help;color:#059669;font-weight:600;">✓</span></td>
    <td class="fin-action-cell">
      <div class="fin-action-wrap">
        <button class="fin-action-btn" onclick="_pvToggleDropdown(event,'rcv-fsc','${s.id}')">&#8230;</button>
        <div id="rcv-fsc-dd-${s.id}" class="fin-action-dropdown" style="display:none;">
          <a href="#" onclick="rcvFscBackfill(${s.id},${_rcvFscClassId},'${s.term_id||_rcvFscTermId}');return false;">&#8635; Backfill Students</a>
          <a href="#" onclick="rcvFscDeleteSchedule(${s.id});return false;">&#128465; Delete</a>
        </div>
      </div>
    </td></tr>`).join('')
    : '<tr><td colspan="5" class="fin-empty">No fee schedules for this class.</td></tr>';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h3 style="margin:0;font-size:1rem;">${_finEsc(className)} — Fee Schedules</h3>
      <button class="fin-btn-teal" onclick="openFeeScheduleModalForClass(${_rcvFscClassId})">+ Add Schedule for This Class</button>
    </div>
    <div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th>FEE ITEM</th><th>AMOUNT</th><th>TERM</th><th title="Students enrolling in this class are assigned this fee automatically.">AUTO-ASSIGNED</th><th>ACTIONS</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

async function openFeeScheduleModalForClass(classId) {
  await openFeeScheduleModal();
  const scopeSel = document.getElementById('rcv-fs-scope-type');
  if (scopeSel) { scopeSel.value = 'class'; _rcvScopeTypeChange('class'); }
  const classSel = document.getElementById('rcv-fs-class');
  if (classSel) { classSel.value = String(classId); classSel.disabled = true; }
  const termSel = document.getElementById('rcv-fs-term');
  if (termSel && _rcvFscTermId) termSel.value = String(_rcvFscTermId);
}

async function rcvFscBackfill(scheduleId, classId, termId) {
  if (!classId || !termId) { showToast('Please select both a term and a class first.', 'error'); return; }
  const studRes = await apiFetch(`${API_BASE}/students/?class_id=${classId}`);
  const students = (studRes && studRes.ok) ? _toArray(await studRes.json()) : [];
  if (!students.length) { showToast('No students found in this class.', 'info'); return; }
  let created=0, existed=0, errors=0;
  await Promise.all(students.map(async st => {
    const r = await apiFetch(`${API_BASE}/receivables/student-fee-assignments/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: st.id, term_id: parseInt(termId,10), fee_schedule_id: scheduleId }),
    });
    if (!r) { errors++; }
    else if (r.status === 409) { existed++; }
    else if (r.ok) { created++; }
    else { errors++; }
  }));
  showToast(`${created} assignment${created!==1?'s':''} created, ${existed} already existed${errors?`, ${errors} error(s)`:'.'}.`, 'success');
}

async function rcvFscDeleteSchedule(scheduleId) {
  if (!confirm('Delete this class fee schedule?')) return;
  const res = await apiFetch(`${API_BASE}/receivables/setup/fee-setup-per-class/${scheduleId}`, { method: 'DELETE' });
  if (res && (res.ok || res.status === 204)) {
    showToast('Schedule deleted.', 'success');
    _rcvFscSchedules = _rcvFscSchedules.filter(s=>String(s.id)!==String(scheduleId));
    _rcvRenderFscPanel(document.getElementById('fsc-right-panel'));
  } else if (res) {
    showToast('Error: ' + await parseApiError(res), 'error');
  }
}

// ==================== MODULE 3 — STUDENT FEE ASSIGNMENTS ====================
let _rcvAsnData  = [];
let _rcvAsnTerm  = '', _rcvAsnStudent = '';

async function loadFeeAssignmentsView(container) {
  _rcvAsnTerm=''; _rcvAsnStudent=''; _rcvAsnData=[];
  await _rcvLoadLookups({ terms:true, items:true, students:true });
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Fee Assignments</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Fee Assignments &rsaquo; Listing</div>
      </div>
      <div class="fin-filter-section">
        <div class="fin-filter-grid">
          <div class="fin-filter-field">
            <label class="fin-filter-label">Term <span class="fin-required">*</span></label>
            <select id="rcv-asn-term" class="fin-filter-select">
              <option value="">Please Select</option>${_rcvTermOptions('')}
            </select>
            <span class="fin-field-error" id="rcv-asn-term-err"></span>
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Student</label>
            <select id="rcv-asn-student" class="fin-filter-select">
              <option value="">All Students</option>
              ${(_rcvStudentsCache||[]).map(s=>`<option value="${s.id}">${_finEsc(`${s.first_name||''} ${s.last_name||''}`.trim())} (${_finEsc(s.student_id||s.code||'')})</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="fin-filter-actions">
          <button class="fin-btn-teal" onclick="rcvAsnLoad()">Load</button>
          <button class="fin-btn-outline" onclick="rcvAsnClear()">Clear</button>
          <button class="fin-btn-cancel" onclick="openAddAssignmentModal()">+ Add Manually</button>
        </div>
      </div>
      <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;margin-top:12px;">
        <div style="flex:1;min-width:0;" id="rcv-asn-table-wrap">
          <p style="color:#888;padding:20px 0;">Select a term above and click Load.</p>
        </div>
        <div id="rcv-asn-preview-panel" style="display:none;min-width:280px;max-width:320px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;"></div>
      </div>
    </div>`;
}

async function rcvAsnLoad() {
  const termId    = document.getElementById('rcv-asn-term')?.value;
  const studentId = document.getElementById('rcv-asn-student')?.value;
  const termErr   = document.getElementById('rcv-asn-term-err');
  if (termErr) termErr.textContent = termId ? '' : 'Please select a term.';
  if (!termId) return;
  _rcvAsnTerm    = termId;
  _rcvAsnStudent = studentId;
  const url = `${API_BASE}/receivables/student-fee-assignments/?term_id=${termId}${studentId?`&student_id=${studentId}`:''}`;
  const res = await apiFetch(url);
  _rcvAsnData = (res && res.ok) ? _toArray(await res.json()) : [];
  _rcvRenderAsnTable();
  if (studentId) _rcvRenderAsnPreview(studentId, termId);
  else { const pp=document.getElementById('rcv-asn-preview-panel'); if(pp) pp.style.display='none'; }
}

function rcvAsnClear() {
  _rcvAsnTerm=''; _rcvAsnStudent=''; _rcvAsnData=[];
  const t=document.getElementById('rcv-asn-term'); if(t) t.value='';
  const s=document.getElementById('rcv-asn-student'); if(s) s.value='';
  const w=document.getElementById('rcv-asn-table-wrap'); if(w) w.innerHTML='<p style="color:#888;padding:20px 0;">Select a term above and click Load.</p>';
  const pp=document.getElementById('rcv-asn-preview-panel'); if(pp) pp.style.display='none';
}

const _RCV_SOURCE_LABELS = {
  auto_enrollment: { label: 'Set at enrollment',         color: '#1a5fb4', bg: '#dce8fb' },
  auto_transport:  { label: 'Set at route assignment',   color: '#92400e', bg: '#fef3c7' },
  auto_eca:        { label: 'Set at ECA enrollment',     color: '#065f46', bg: '#d1fae5' },
  auto_meal_plan:  { label: 'Set at meal plan',          color: '#0f766e', bg: '#ccfbf1' },
  manual:          { label: 'Manually created',          color: '#374151', bg: '#f3f4f6' },
};
function _rcvSourceBadge(source) {
  const m = _RCV_SOURCE_LABELS[source] || { label: source||'unknown', color:'#374151', bg:'#f3f4f6' };
  return `<span title="${m.label}" style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:0.74rem;font-weight:600;color:${m.color};background:${m.bg};">${_finEsc(source||'-')}</span>`;
}

function _rcvRenderAsnTable() {
  const wrap = document.getElementById('rcv-asn-table-wrap');
  if (!wrap) return;
  if (!_rcvAsnData.length) { wrap.innerHTML='<p style="color:#888;padding:20px 0;">No assignments found for this selection.</p>'; return; }
  const rows = _rcvAsnData.map(a => {
    const effAmt = a.override_amount != null ? a.override_amount : (a.fee_schedule?.amount ?? a.amount ?? 0);
    const amtDisplay = a.override_amount != null
      ? `<span style="color:#d97706;font-weight:600;" title="Override amount">KES ${_finFmt(a.override_amount)} ✎</span>`
      : `KES ${_finFmt(effAmt)}`;
    const schedDesc = a.fee_schedule
      ? `${_rcvFeeItemName(a.fee_schedule.fee_item_id)} — ${_rcvScopeBadge(a.fee_schedule.scope_type)}`
      : (a.fee_schedule_id ? `Schedule #${a.fee_schedule_id}` : '—');
    return `<tr id="rcv-asn-row-${a.id}">
      <td>${_finEsc(_rcvStudentName(a.student_id))}</td>
      <td>${schedDesc}</td>
      <td>${amtDisplay}</td>
      <td>${a.override_amount != null ? `KES ${_finFmt(a.override_amount)}` : '—'}</td>
      <td>${_rcvSourceBadge(a.source_type)}</td>
      <td>${_finEsc((a.created_at||'').split('T')[0])}</td>
      <td class="fin-action-cell">
        <div class="fin-action-wrap">
          <button class="fin-action-btn" onclick="_pvToggleDropdown(event,'rcv-asn','${a.id}')">&#8230;</button>
          <div id="rcv-asn-dd-${a.id}" class="fin-action-dropdown" style="display:none;">
            <a href="#" onclick="rcvAsnOverrideInline(${a.id},${effAmt});return false;">✎ Override Amount</a>
            <a href="#" onclick="rcvAsnDelete(${a.id});return false;">&#128465; Delete</a>
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>STUDENT</th><th>FEE SCHEDULE</th><th>EFFECTIVE AMOUNT</th><th>OVERRIDE</th><th>SOURCE</th><th>CREATED</th><th>ACTION</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function rcvAsnOverrideInline(id, currentAmt) {
  document.querySelectorAll('[id^="rcv-asn-dd-"]').forEach(d=>d.style.display='none');
  const row = document.getElementById(`rcv-asn-row-${id}`);
  if (!row) return;
  const a = _rcvAsnData.find(x=>String(x.id)===String(id));
  if (!a) return;
  const cells = row.querySelectorAll('td');
  cells[2].innerHTML = `<input type="number" id="rcv-asn-override-${id}" class="fin-form-input" style="width:120px;" step="0.01" value="${currentAmt}">
    <button class="fin-btn-teal" style="margin-left:6px;padding:4px 10px;" onclick="rcvAsnOverrideSave(${id})">Save</button>
    <button class="fin-btn-cancel" style="padding:4px 10px;" onclick="rcvAsnLoad()">✕</button>`;
}

async function rcvAsnOverrideSave(id) {
  const a = _rcvAsnData.find(x=>String(x.id)===String(id));
  if (!a) return;
  const overrideVal = parseFloat(document.getElementById(`rcv-asn-override-${id}`)?.value);
  if (isNaN(overrideVal)) { showToast('Enter a valid amount.', 'error'); return; }
  const delRes = await apiFetch(`${API_BASE}/receivables/student-fee-assignments/${id}`, { method: 'DELETE' });
  if (!delRes || (!delRes.ok && delRes.status !== 204)) { showToast('Failed to update assignment.', 'error'); return; }
  const postRes = await apiFetch(`${API_BASE}/receivables/student-fee-assignments/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_id: a.student_id, term_id: a.term_id, fee_schedule_id: a.fee_schedule_id, override_amount: overrideVal }),
  });
  if (postRes && postRes.ok) { showToast('Override saved.', 'success'); rcvAsnLoad(); }
  else if (postRes) { showToast('Error: ' + await parseApiError(postRes), 'error'); }
}

async function rcvAsnDelete(id) {
  if (!confirm('Remove this fee assignment?')) return;
  const res = await apiFetch(`${API_BASE}/receivables/student-fee-assignments/${id}`, { method: 'DELETE' });
  if (res && (res.ok || res.status === 204)) {
    showToast('Assignment removed.', 'success');
    _rcvAsnData = _rcvAsnData.filter(a=>String(a.id)!==String(id));
    _rcvRenderAsnTable();
  } else if (res) { showToast('Error: ' + await parseApiError(res), 'error'); }
}

function _rcvRenderAsnPreview(studentId, termId) {
  const panel = document.getElementById('rcv-asn-preview-panel');
  if (!panel) return;
  panel.style.display = '';
  const stuAssignments = _rcvAsnData.filter(a=>String(a.student_id)===String(studentId));
  const total = stuAssignments.reduce((s,a) => s + parseFloat(a.override_amount??a.fee_schedule?.amount??a.amount??0), 0);
  const rows = stuAssignments.map(a => {
    const amt = parseFloat(a.override_amount??a.fee_schedule?.amount??a.amount??0);
    return `<li style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.85rem;">
      <span>${_finEsc(_rcvFeeItemName(a.fee_schedule?.fee_item_id||a.fee_item_id))}</span>
      <span>KES ${_finFmt(amt)}</span>
    </li>`;
  }).join('');
  panel.innerHTML = `
    <p style="font-weight:600;margin:0 0 10px;">${_finEsc(_rcvStudentName(studentId))}</p>
    <p style="font-size:0.8rem;color:#666;margin:0 0 8px;">${_finEsc(_rcvTermName(termId))}</p>
    <ul style="list-style:none;padding:0;margin:0 0 10px;">${rows||'<li style="color:#888;font-size:0.85rem;">No assignments.</li>'}</ul>
    <div style="border-top:1px solid #e5e7eb;padding-top:8px;display:flex;justify-content:space-between;font-weight:600;font-size:0.9rem;">
      <span>Estimated Total</span><span>KES ${_finFmt(total)}</span>
    </div>
    <div style="margin-top:14px;">
      <button class="fin-btn-teal" style="width:100%;" onclick="loadInvoiceGenerateView(document.getElementById('main-content'),${studentId},${termId})">Generate Invoice &#8594;</button>
    </div>`;
}

async function openAddAssignmentModal() {
  _rcvCloseModal();
  await _rcvLoadLookups({ terms:true, students:true });
  const res = await apiFetch(`${API_BASE}/receivables/setup/fee-schedules`);
  const schedules = (res&&res.ok) ? _toArray(await res.json()) : rcvFeeSchedulesData;
  const overlay = document.createElement('div');
  overlay.id = 'fin-gen-modal-overlay';
  overlay.style = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:1000;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:8px;padding:28px;max-width:480px;width:92%;">
      <h3 style="margin-top:0;">Add Fee Assignment Manually</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Student <span class="fin-required">*</span></label>
        <select id="rcv-add-asn-student" class="fin-form-select">
          <option value="">Please Select</option>
          ${(_rcvStudentsCache||[]).map(s=>`<option value="${s.id}">${_finEsc(`${s.first_name||''} ${s.last_name||''}`.trim())} (${_finEsc(s.student_id||'')})</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Term <span class="fin-required">*</span></label>
        <select id="rcv-add-asn-term" class="fin-form-select">
          <option value="">Please Select</option>${_rcvTermOptions(_rcvAsnTerm)}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Fee Schedule <span class="fin-required">*</span></label>
        <select id="rcv-add-asn-schedule" class="fin-form-select">
          <option value="">Please Select</option>
          ${schedules.map(s=>`<option value="${s.id}">${_finEsc(_rcvFeeItemName(s.fee_item_id))} — ${_finEsc(s.scope_type)} — KES ${_finFmt(s.amount)}</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Override Amount <small style="color:#888;">(optional)</small></label>
        <input type="number" id="rcv-add-asn-override" class="fin-form-input" step="0.01" min="0" placeholder="Leave blank to use schedule amount">
      </div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="submitAddAssignment()">Submit</button>
        <button class="fin-btn-cancel" onclick="_rcvCloseModal()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function submitAddAssignment() {
  const studentId  = document.getElementById('rcv-add-asn-student')?.value;
  const termId     = document.getElementById('rcv-add-asn-term')?.value;
  const scheduleId = document.getElementById('rcv-add-asn-schedule')?.value;
  const overrideRaw= document.getElementById('rcv-add-asn-override')?.value;
  if (!studentId||!termId||!scheduleId) { showToast('Student, Term, and Fee Schedule are required.','error'); return; }
  const payload = {
    student_id: parseInt(studentId,10), term_id: parseInt(termId,10), fee_schedule_id: parseInt(scheduleId,10),
    override_amount: overrideRaw ? parseFloat(overrideRaw) : null,
  };
  const res = await apiFetch(`${API_BASE}/receivables/student-fee-assignments/`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload),
  });
  if (res && res.status === 409) { showToast('This fee is already assigned to the student.','error'); return; }
  if (res && res.ok) { showToast('Assignment created.','success'); _rcvCloseModal(); rcvAsnLoad(); }
  else if (res) { showToast('Error: ' + await parseApiError(res),'error'); }
}

// ==================== MODULE 4 — FEE INVOICES ====================
let _rcvInvData = [];
let _rcvInvPage=1, _rcvInvPerPage=25, _rcvInvFilterStatus='', _rcvInvFilterTerm='', _rcvInvFilterStudent='';

async function loadFeeInvoicesView(container) {
  _rcvInvPage=1; _rcvInvFilterStatus=''; _rcvInvFilterTerm=''; _rcvInvFilterStudent='';
  await _rcvLoadLookups({ terms:true, students:true });
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Fee Invoices</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Fee Invoices &rsaquo; Listing</div>
      </div>
      ${renderBulkUploadBar('fee-invoices', 'rcvInvLoad')}
      <div class="fin-filter-section">
        <div class="fin-filter-grid">
          <div class="fin-filter-field">
            <label class="fin-filter-label">Status</label>
            <select id="rcv-inv-filter-status" class="fin-filter-select">
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Term</label>
            <select id="rcv-inv-filter-term" class="fin-filter-select">
              <option value="">All</option>${_rcvTermOptions('')}
            </select>
          </div>
          <div class="fin-filter-field">
            <label class="fin-filter-label">Student</label>
            <select id="rcv-inv-filter-student" class="fin-filter-select">
              <option value="">All</option>
              ${(_rcvStudentsCache||[]).map(s=>`<option value="${s.id}">${_finEsc(`${s.first_name||''} ${s.last_name||''}`.trim())}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="fin-filter-actions">
          <button class="fin-btn-teal" onclick="rcvInvLoad()">Load</button>
          <button class="fin-btn-outline" onclick="rcvInvClear()">Clear</button>
        </div>
      </div>
      <div class="fin-controls-row" style="margin-top:8px;">
        <div class="fin-controls-left">Total <span id="rcv-inv-total">0</span> entries</div>
      </div>
      <div id="rcv-inv-table-container"><p style="color:#888;padding:20px 0;">Apply filters and click Load.</p></div>
      <div id="rcv-inv-pagination"></div>
    </div>`;
}

async function rcvInvLoad() {
  _rcvInvFilterStatus  = document.getElementById('rcv-inv-filter-status')?.value  || '';
  _rcvInvFilterTerm    = document.getElementById('rcv-inv-filter-term')?.value    || '';
  _rcvInvFilterStudent = document.getElementById('rcv-inv-filter-student')?.value || '';
  let url = `${API_BASE}/receivables/fee-invoices?`;
  if (_rcvInvFilterStatus)  url += `status=${_rcvInvFilterStatus}&`;
  if (_rcvInvFilterTerm)    url += `term_id=${_rcvInvFilterTerm}&`;
  if (_rcvInvFilterStudent) url += `student_id=${_rcvInvFilterStudent}&`;
  const res = await apiFetch(url.replace(/&$/, ''));
  _rcvInvData = (res && res.ok) ? _toArray(await res.json()) : [];
  _rcvRenderInvTable();
}

function rcvInvClear() {
  _rcvInvFilterStatus=''; _rcvInvFilterTerm=''; _rcvInvFilterStudent=''; _rcvInvData=[];
  ['rcv-inv-filter-status','rcv-inv-filter-term','rcv-inv-filter-student'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('rcv-inv-table-container').innerHTML='<p style="color:#888;padding:20px 0;">Apply filters and click Load.</p>';
  const tot=document.getElementById('rcv-inv-total'); if(tot) tot.textContent='0';
}

const _RCV_INV_STATUS_STYLES = {
  draft:           'background:#f3f4f6;color:#374151',
  issued:          'background:#dce8fb;color:#1a5fb4',
  partially_paid:  'background:#fef3c7;color:#92400e',
  paid:            'background:#d1fae5;color:#065f46',
  cancelled:       'background:#fee2e2;color:#991b1b',
  overdue:         'background:#fca5a5;color:#7f1d1d',
};
function _rcvInvStatusBadge(status) {
  const style = _RCV_INV_STATUS_STYLES[status] || 'background:#f3f4f6;color:#374151';
  const label = (status||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  return `<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:0.78rem;font-weight:600;${style}">${_finEsc(label)}</span>`;
}

function _rcvRenderInvTable() {
  const el=document.getElementById('rcv-inv-table-container');
  const totEl=document.getElementById('rcv-inv-total');
  if(totEl) totEl.textContent=_rcvInvData.length;
  if(!el) return;
  if(!_rcvInvData.length){el.innerHTML='<p style="color:#888;padding:20px 0;">No invoices found.</p>';return;}
  const start=(_rcvInvPage-1)*_rcvInvPerPage;
  const paged=_rcvInvData.slice(start,start+_rcvInvPerPage);
  const rows=paged.map(inv=>{
    const due=parseFloat(inv.total_amount||0);
    const paid=parseFloat(inv.amount_paid||0);
    const bal=due-paid;
    return `<tr style="cursor:pointer;" onclick="loadInvoiceDetailView(document.getElementById('main-content'),${inv.id})">
      <td><a href="#" onclick="loadInvoiceDetailView(document.getElementById('main-content'),${inv.id});return false;">${_finEsc(inv.invoice_number||`#${inv.id}`)}</a></td>
      <td>${_finEsc(_rcvStudentName(inv.student_id))}</td>
      <td>${_finEsc(_rcvTermName(inv.term_id))}</td>
      <td>KES ${_finFmt(due)}</td>
      <td>KES ${_finFmt(paid)}</td>
      <td>KES ${_finFmt(bal)}</td>
      <td>${_rcvInvStatusBadge(inv.status)}</td>
      <td>${_finEsc((inv.due_date||'').split('T')[0])}</td>
    </tr>`;
  }).join('');
  el.innerHTML=`<div class="fin-table-wrap"><table class="fin-table"><thead><tr>
    <th>INVOICE NO.</th><th>STUDENT</th><th>TERM</th><th>AMOUNT DUE</th><th>PAID</th><th>BALANCE</th><th>STATUS</th><th>DUE DATE</th>
  </tr></thead><tbody>${rows}</tbody></table></div>`;
  const pages=Math.max(1,Math.ceil(_rcvInvData.length/_rcvInvPerPage));
  let pg=''; for(let i=1;i<=pages;i++) pg+=`<button class="${i===_rcvInvPage?'fin-pg-active':''}" onclick="_rcvInvPage=${i};_rcvRenderInvTable()">${i}</button>`;
  const pgEl=document.getElementById('rcv-inv-pagination');
  if(pgEl) pgEl.innerHTML=`<div class="fin-pagination">${pg}</div>`;
}

// 4.1 — Generate Single Invoice
async function loadInvoiceGenerateView(container, presetStudentId, presetTermId) {
  await _rcvLoadLookups({ terms:true, students:true, accounts:true, ledgers:true });
  const lastLedger  = localStorage.getItem('rcv_last_ledger_id')  || '';
  const lastAccount = localStorage.getItem('rcv_last_income_account_id') || '';
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Generate Invoice</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-fee-invoices');return false;">Fee Invoices</a>
          &rsaquo; Generate
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:680px;">
        <h3 style="margin-top:0;font-size:1rem;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Step 1 — Configure</h3>
        <div class="fin-form-group">
          <label class="fin-form-label">Student <span class="fin-required">*</span></label>
          <select id="rcv-gen-student" class="fin-form-select" onchange="rcvGenReviewAssignments()" ${presetStudentId?'disabled':''}>
            <option value="">Please Select</option>
            ${(_rcvStudentsCache||[]).map(s=>`<option value="${s.id}" ${String(s.id)===String(presetStudentId)?'selected':''}>${_finEsc(`${s.first_name||''} ${s.last_name||''}`.trim())} (${_finEsc(s.student_id||'')})</option>`).join('')}
          </select>
          ${presetStudentId?`<input type="hidden" id="rcv-gen-student-hidden" value="${presetStudentId}">`:''}
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Term <span class="fin-required">*</span></label>
          <select id="rcv-gen-term" class="fin-form-select" onchange="rcvGenReviewAssignments()">
            <option value="">Please Select</option>${_rcvTermOptions(presetTermId)}
          </select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Due Date <span class="fin-required">*</span></label>
          <input type="date" id="rcv-gen-due-date" class="fin-form-input">
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Ledger <span class="fin-required">*</span></label>
          <select id="rcv-gen-ledger" class="fin-form-select">
            <option value="">Please Select</option>${_rcvLedgerOptions(lastLedger)}
          </select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Income Account <span class="fin-required">*</span></label>
          <select id="rcv-gen-income-account" class="fin-form-select">
            <option value="">Please Select</option>${_rcvAccountOptions('income', lastAccount)}
          </select>
        </div>
        <h3 style="font-size:1rem;border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-top:24px;">Step 2 — Review Assignments</h3>
        <div id="rcv-gen-preview">
          <p style="color:#888;font-size:0.9rem;">Select a student and term to preview assignments.</p>
        </div>
        <div class="fin-form-actions">
          <button id="rcv-gen-submit-btn" class="fin-btn-teal" onclick="submitGenerateSingleInvoice()" disabled>Generate Invoice</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-fee-invoices')">Cancel</button>
        </div>
      </div>
    </div>`;
  if (presetStudentId && presetTermId) {
    const termSel = document.getElementById('rcv-gen-term');
    if (termSel) termSel.value = String(presetTermId);
    rcvGenReviewAssignments();
  }
}

async function rcvGenReviewAssignments() {
  const studentId = document.getElementById('rcv-gen-student-hidden')?.value || document.getElementById('rcv-gen-student')?.value;
  const termId    = document.getElementById('rcv-gen-term')?.value;
  const preview   = document.getElementById('rcv-gen-preview');
  const btn       = document.getElementById('rcv-gen-submit-btn');
  if (!preview) return;
  if (!studentId || !termId) {
    preview.innerHTML='<p style="color:#888;font-size:0.9rem;">Select a student and term to preview assignments.</p>';
    if(btn) btn.disabled=true; return;
  }
  preview.innerHTML='<p style="color:#888;">Loading&#8230;</p>';
  await _rcvLoadLookups({ items:true });
  const res = await apiFetch(`${API_BASE}/receivables/student-fee-assignments/?student_id=${studentId}&term_id=${termId}`);
  const assignments = (res&&res.ok) ? _toArray(await res.json()) : [];
  if (!assignments.length) {
    preview.innerHTML=`<p style="color:#b45309;font-size:0.9rem;">&#9888; No fee assignments found for this student in the selected term. Go to <a href="#" onclick="loadView('fin-fee-assignments');return false;">Fee Assignments</a> to configure them first.</p>`;
    if(btn) btn.disabled=true; return;
  }
  let total=0;
  const rows=assignments.map(a=>{
    const base=parseFloat(a.fee_schedule?.amount??a.amount??0);
    const override=a.override_amount!=null?parseFloat(a.override_amount):null;
    const net=override??base;
    total+=net;
    return `<tr>
      <td>${_finEsc(_rcvFeeItemName(a.fee_schedule?.fee_item_id||a.fee_item_id))}</td>
      <td>KES ${_finFmt(base)}</td>
      <td>×1.0 (100%)</td>
      <td>KES ${_finFmt(net)}</td>
      <td>—</td>
      <td>KES ${_finFmt(net)}</td>
    </tr>`;
  }).join('');
  preview.innerHTML=`<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>LINE</th><th>BASE AMOUNT</th><th>PRORATION</th><th>PRORATED</th><th>DISCOUNT</th><th>NET</th></tr></thead>
    <tbody>${rows}
    <tr style="font-weight:600;border-top:2px solid #e5e7eb;"><td colspan="5">Total</td><td>KES ${_finFmt(total)}</td></tr>
    </tbody></table></div>
    <p style="font-size:0.8rem;color:#888;margin-top:6px;"><em>Preview amounts use proration_factor=1.0. Actual proration is computed server-side on generate.</em></p>`;
  if(btn) btn.disabled=false;
}

async function submitGenerateSingleInvoice() {
  const studentId       = parseInt(document.getElementById('rcv-gen-student-hidden')?.value || document.getElementById('rcv-gen-student')?.value, 10);
  const termId          = parseInt(document.getElementById('rcv-gen-term')?.value, 10);
  const dueDate         = document.getElementById('rcv-gen-due-date')?.value;
  const ledgerId        = parseInt(document.getElementById('rcv-gen-ledger')?.value, 10);
  const incomeAccountId = parseInt(document.getElementById('rcv-gen-income-account')?.value, 10);
  if (!studentId||!termId||!dueDate||!ledgerId||!incomeAccountId) { showToast('All fields are required.','error'); return; }
  localStorage.setItem('rcv_last_ledger_id',        String(ledgerId));
  localStorage.setItem('rcv_last_income_account_id', String(incomeAccountId));
  const res = await apiFetch(`${API_BASE}/receivables/fee-invoices/generate`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ student_id:studentId, term_id:termId, due_date:dueDate, ledger_id:ledgerId, income_account_id:incomeAccountId }),
  });
  if (res && res.status===409) {
    showToast('An open invoice already exists for this student in this term. Cancel it before regenerating.','error'); return;
  }
  if (res && res.ok) {
    const inv = await res.json();
    showToast('Invoice generated.','success');
    window._rcvCurrentInvoiceId = inv.id;
    loadInvoiceDetailView(document.getElementById('main-content'), inv.id);
  } else if (res) { showToast('Error: ' + await parseApiError(res),'error'); }
}

// 4.2 — Invoice Detail
async function loadInvoiceDetailView(container, invoiceId) {
  window._rcvCurrentInvoiceId = invoiceId;
  container.innerHTML = `<div class="fin-page"><p style="color:#888;padding:20px 0;">Loading invoice&#8230;</p></div>`;
  const res = await apiFetch(`${API_BASE}/receivables/fee-invoices/${invoiceId}`);
  if (!res || !res.ok) { container.innerHTML=`<div class="fin-page"><p style="color:#c0392b;">Failed to load invoice.</p></div>`; return; }
  const inv = await res.json();
  await _rcvLoadLookups({ terms:true, students:true, accounts:true });
  const lineItems = _toArray(inv.line_items||inv.lineItems||[]);
  const due  = parseFloat(inv.total_amount||0);
  const paid = parseFloat(inv.amount_paid||0);
  const bal  = due - paid;
  const hasFull = lineItems.some(li => li.base_unit_price!=null);
  const lineRows = lineItems.length ? lineItems.map(li => {
    if (hasFull && li.base_unit_price!=null) {
      const base   = parseFloat(li.base_unit_price||0);
      const factor = parseFloat(li.proration_factor||1);
      const prorated= base*factor;
      const disc   = parseFloat(li.discount_amount||0);
      const net    = parseFloat(li.amount||prorated-disc);
      const pct    = (factor*100).toFixed(1);
      return `<tr>
        <td>${_finEsc(li.description||'')}</td>
        <td>KES ${_finFmt(base)}</td>
        <td>×${factor.toFixed(4)} → KES ${_finFmt(prorated)} <small style="color:#888;">(${pct}%)</small></td>
        <td>${disc>0?`−KES ${_finFmt(disc)}`:'—'}</td>
        <td>KES ${_finFmt(net)}</td>
      </tr>`;
    }
    return `<tr><td colspan="${hasFull?4:1}">${_finEsc(li.description||'')}</td><td>KES ${_finFmt(parseFloat(li.amount||0))}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="fin-empty">No line items.</td></tr>';
  const status = inv.status||'draft';
  let actions = '';
  if (status==='draft') {
    actions=`<button class="fin-btn-teal" onclick="rcvInvoiceIssue(${inv.id})">Issue Invoice</button>
             <button class="fin-btn-cancel" onclick="rcvInvoiceCancel(${inv.id})">Cancel Invoice</button>`;
  } else if (status==='issued'||status==='partially_paid'||status==='overdue') {
    actions=`<button class="fin-btn-teal" onclick="openRecordPaymentModal(${inv.id},${bal},${inv.income_account_id||'null'})">Record Payment</button>
             <button class="fin-btn-cancel" onclick="rcvInvoiceCancel(${inv.id})">Cancel Invoice</button>`;
  }
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Invoice ${_finEsc(inv.invoice_number||'Detail')}</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Finance &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('fin-fee-invoices');return false;">Fee Invoices</a>
          &rsaquo; Detail
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 32px;margin-bottom:20px;max-width:680px;">
        <div><span style="color:#888;font-size:0.82rem;">Invoice No.</span><br><strong>${_finEsc(inv.invoice_number||`#${inv.id}`)}</strong></div>
        <div><span style="color:#888;font-size:0.82rem;">Status</span><br>${_rcvInvStatusBadge(status)}</div>
        <div><span style="color:#888;font-size:0.82rem;">Student</span><br>${_finEsc(_rcvStudentName(inv.student_id))}</div>
        <div><span style="color:#888;font-size:0.82rem;">Term</span><br>${_finEsc(_rcvTermName(inv.term_id))}</div>
        <div><span style="color:#888;font-size:0.82rem;">Issue Date</span><br>${_finEsc((inv.issue_date||inv.created_at||'').split('T')[0]||'—')}</div>
        <div><span style="color:#888;font-size:0.82rem;">Due Date</span><br>${_finEsc((inv.due_date||'').split('T')[0]||'—')}</div>
      </div>
      <div class="fin-table-wrap" style="max-width:820px;">
        <table class="fin-table">
          <thead><tr>
            <th>DESCRIPTION</th>
            ${hasFull?'<th>BASE</th><th>PRORATION</th><th>DISCOUNT</th>':''}
            <th>NET</th>
          </tr></thead>
          <tbody>${lineRows}</tbody>
        </table>
      </div>
      <div style="max-width:820px;border:1px solid #e5e7eb;border-radius:6px;padding:14px 18px;margin-top:16px;background:#f9fafb;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span>Amount Due</span><span>KES ${_finFmt(due)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span>Amount Paid</span><span>KES ${_finFmt(paid)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:1.05rem;border-top:1px solid #e5e7eb;padding-top:8px;">
          <span>Balance</span><span>KES ${_finFmt(bal)}</span>
        </div>
      </div>
      ${actions?`<div class="fin-form-actions" style="margin-top:20px;">${actions}
        <button class="fin-btn-outline" onclick="loadView('fin-fee-invoices')">&#8592; Back to List</button>
      </div>`:
      `<div style="margin-top:16px;"><button class="fin-btn-outline" onclick="loadView('fin-fee-invoices')">&#8592; Back to List</button></div>`}
    </div>`;
}

async function rcvInvoiceIssue(id) {
  if (!confirm('Issue this invoice? It will become visible to payers.')) return;
  const res = await apiFetch(`${API_BASE}/receivables/fee-invoices/${id}/issue`, { method:'POST' });
  if (res && res.ok) { showToast('Invoice issued.','success'); loadInvoiceDetailView(document.getElementById('main-content'),id); }
  else if (res) { showToast('Error: '+await parseApiError(res),'error'); }
}

async function rcvInvoiceCancel(id) {
  if (!confirm('Cancel this invoice? This cannot be undone if payments exist.')) return;
  const res = await apiFetch(`${API_BASE}/receivables/fee-invoices/${id}/cancel`, { method:'POST' });
  if (res && res.ok) { showToast('Invoice cancelled.','success'); loadInvoiceDetailView(document.getElementById('main-content'),id); }
  else if (res) { showToast('Error: '+await parseApiError(res),'error'); }
}

// 4.3 — Record Payment Modal
async function openRecordPaymentModal(invoiceId, balanceDue, incomeAccountId) {
  _rcvCloseModal();
  await _rcvLoadLookups({ accounts:true });
  const lastDebit = localStorage.getItem('rcv_last_debit_account_id') || '';
  const today = new Date().toISOString().split('T')[0];
  const creditAcct = (_rcvAccountsCache||[]).find(a=>String(a.id)===String(incomeAccountId));
  const overlay = document.createElement('div');
  overlay.id = 'fin-gen-modal-overlay';
  overlay.style = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:1000;overflow-y:auto;';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:8px;padding:28px;max-width:480px;width:92%;max-height:90vh;overflow-y:auto;">
      <h3 style="margin-top:0;">Record Payment</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Amount <span class="fin-required">*</span></label>
        <input type="number" id="rcv-pay-amount" class="fin-form-input" step="0.01" min="0.01" value="${_finFmt(balanceDue).replace(/,/g,'')}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Payment Method <span class="fin-required">*</span></label>
        <select id="rcv-pay-method" class="fin-form-select">
          <option value="">Please Select</option>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="mpesa">M-Pesa</option>
          <option value="cheque">Cheque</option>
          <option value="card">Card</option>
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Payment Date <span class="fin-required">*</span></label>
        <input type="date" id="rcv-pay-date" class="fin-form-input" value="${today}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Reference <small style="color:#888;">(M-Pesa code, cheque no., etc.)</small></label>
        <input type="text" id="rcv-pay-ref" class="fin-form-input">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Debit Account (Cash/Bank) <span class="fin-required">*</span></label>
        <select id="rcv-pay-debit" class="fin-form-select">
          <option value="">Please Select</option>${_rcvAccountOptions('asset', lastDebit)}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Credit Account (Income)</label>
        <p style="margin:4px 0;font-size:0.9rem;color:#374151;padding:8px;background:#f9fafb;border-radius:4px;">
          ${creditAcct ? `${_finEsc(creditAcct.number||'')} — ${_finEsc(creditAcct.account_name||'')}` : (incomeAccountId ? `Account #${incomeAccountId}` : '— not set —')}
        </p>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="rcv-pay-notes" class="fin-form-input" rows="2" style="resize:vertical;"></textarea>
      </div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="submitRecordPayment(${invoiceId},${incomeAccountId||'null'})">Submit Payment</button>
        <button class="fin-btn-cancel" onclick="_rcvCloseModal()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function submitRecordPayment(invoiceId, incomeAccountId) {
  const amount  = parseFloat(document.getElementById('rcv-pay-amount')?.value);
  const method  = document.getElementById('rcv-pay-method')?.value;
  const date    = document.getElementById('rcv-pay-date')?.value;
  const ref     = (document.getElementById('rcv-pay-ref')?.value||'').trim();
  const debitId = parseInt(document.getElementById('rcv-pay-debit')?.value, 10);
  const notes   = (document.getElementById('rcv-pay-notes')?.value||'').trim();
  if (!amount||isNaN(amount)||!method||!date||!debitId) { showToast('Amount, Method, Date, and Debit Account are required.','error'); return; }
  localStorage.setItem('rcv_last_debit_account_id', String(debitId));
  const payload = {
    fee_invoice_id: invoiceId,
    amount, payment_method: method,
    payment_date: date + 'T00:00:00',
    reference: ref || null,
    debit_cash_account_id: debitId,
    credit_income_account_id: incomeAccountId || null,
    notes: notes || null,
  };
  const res = await apiFetch(`${API_BASE}/receivables/receipts`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload),
  });
  if (res && res.ok) {
    showToast('Payment recorded.','success');
    _rcvCloseModal();
    loadInvoiceDetailView(document.getElementById('main-content'), invoiceId);
  } else if (res) { showToast('Error: '+await parseApiError(res),'error'); }
}

// ==================== MODULE 5 — BULK INVOICE GENERATE ====================
let _rcvBulkStep = 1;
let _rcvBulkStudentIds = null;

async function loadBulkInvoiceView(container) {
  _rcvBulkStep=1; _rcvBulkStudentIds=null;
  await _rcvLoadLookups({ terms:true, classes:true, accounts:true, ledgers:true });
  _rcvRenderBulkStep1(container);
}

function _rcvRenderBulkStep1(container) {
  const lastLedger  = localStorage.getItem('rcv_last_ledger_id')  || '';
  const lastAccount = localStorage.getItem('rcv_last_income_account_id') || '';
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Bulk Invoice Generate</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Bulk Invoice Generate</div>
      </div>
      <div class="fin-form-wrap" style="max-width:640px;">
        <h3 style="margin-top:0;font-size:1rem;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">Step 1 — Scope Configuration</h3>
        <div class="fin-form-group">
          <label class="fin-form-label">Term <span class="fin-required">*</span></label>
          <select id="rcv-bulk-term" class="fin-form-select"><option value="">Please Select</option>${_rcvTermOptions('')}</select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Due Date <span class="fin-required">*</span></label>
          <input type="date" id="rcv-bulk-due-date" class="fin-form-input">
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Ledger <span class="fin-required">*</span></label>
          <select id="rcv-bulk-ledger" class="fin-form-select"><option value="">Please Select</option>${_rcvLedgerOptions(lastLedger)}</select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Income Account <span class="fin-required">*</span></label>
          <select id="rcv-bulk-income-account" class="fin-form-select"><option value="">Please Select</option>${_rcvAccountOptions('income', lastAccount)}</select>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Target Students <span class="fin-required">*</span></label>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;">
            <input type="radio" name="rcv-bulk-target" value="all" checked onchange="rcvBulkTargetChange('all')"> All active students
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="radio" name="rcv-bulk-target" value="class" onchange="rcvBulkTargetChange('class')"> Specific class
          </label>
        </div>
        <div id="rcv-bulk-class-wrap" style="display:none;" class="fin-form-group">
          <label class="fin-form-label">Class <span class="fin-required">*</span></label>
          <select id="rcv-bulk-class" class="fin-form-select">
            <option value="">Please Select</option>${_rcvClassOptions('')}
          </select>
        </div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="rcvBulkPreFlight()">&#128269; Pre-flight Check</button>
          <button class="fin-btn-cancel" onclick="loadView('fin-fee-invoices')">Cancel</button>
        </div>
      </div>
    </div>`;
}

function rcvBulkTargetChange(val) {
  const wrap=document.getElementById('rcv-bulk-class-wrap');
  if(wrap) wrap.style.display=val==='class'?'':'none';
}

async function rcvBulkPreFlight() {
  const termId      = document.getElementById('rcv-bulk-term')?.value;
  const dueDate     = document.getElementById('rcv-bulk-due-date')?.value;
  const ledgerId    = document.getElementById('rcv-bulk-ledger')?.value;
  const incAcct     = document.getElementById('rcv-bulk-income-account')?.value;
  const target      = document.querySelector('input[name="rcv-bulk-target"]:checked')?.value;
  const classId     = document.getElementById('rcv-bulk-class')?.value;
  if (!termId||!dueDate||!ledgerId||!incAcct) { showToast('All fields are required.','error'); return; }
  if (target==='class'&&!classId) { showToast('Please select a class.','error'); return; }

  let studentIds = null;
  if (target==='class') {
    const stRes = await apiFetch(`${API_BASE}/students/?class_id=${classId}`);
    const students = (stRes&&stRes.ok) ? _toArray(await stRes.json()) : [];
    studentIds = students.map(s=>s.id);
  }
  _rcvBulkStudentIds = studentIds;

  const [existingRes, assignRes] = await Promise.all([
    apiFetch(`${API_BASE}/receivables/fee-invoices?term_id=${termId}&status=issued`),
    apiFetch(`${API_BASE}/receivables/student-fee-assignments/?term_id=${termId}`),
  ]);
  const existing   = (existingRes&&existingRes.ok)  ? _toArray(await existingRes.json()) : [];
  const allAssigns = (assignRes&&assignRes.ok)       ? _toArray(await assignRes.json())  : [];

  const inScope = studentIds ? studentIds.length : '?';
  const alreadyOpen = existing.filter(inv=>!studentIds||studentIds.includes(inv.student_id)).length;
  const assignedStudents = new Set(allAssigns.map(a=>a.student_id));
  const noAssign = studentIds ? studentIds.filter(id=>!assignedStudents.has(id)).length : 0;
  const willGen = studentIds ? Math.max(0, studentIds.length - alreadyOpen - noAssign) : '?';

  const container = document.getElementById('main-content');
  container.innerHTML += ``;
  const wrap = document.querySelector('.fin-form-wrap');
  if (!wrap) return;
  wrap.insertAdjacentHTML('beforeend', `
    <div id="rcv-bulk-preflight" style="margin-top:20px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <h3 style="padding:12px 16px;margin:0;font-size:0.95rem;background:#f3f4f6;">Step 2 — Pre-flight Check</h3>
      <table class="fin-table" style="margin:0;">
        <tbody>
          <tr><td>Students in scope</td><td><strong>${inScope}</strong></td></tr>
          <tr><td>Already have open invoice <small style="color:#888;">(will be skipped)</small></td><td><strong>${alreadyOpen}</strong></td></tr>
          <tr><td>Have no fee assignments <small style="color:#e67e22;">⚠ (may error)</small></td><td><strong>${noAssign}</strong></td></tr>
          <tr style="font-weight:700;"><td>Will generate</td><td>${willGen}</td></tr>
        </tbody>
      </table>
      <div style="padding:14px 16px;">
        <button class="fin-btn-teal" onclick="rcvBulkGenerate()">Proceed with Generation (${willGen})</button>
      </div>
    </div>`);
}

async function rcvBulkGenerate() {
  const termId   = parseInt(document.getElementById('rcv-bulk-term')?.value, 10);
  const dueDate  = document.getElementById('rcv-bulk-due-date')?.value;
  const ledgerId = parseInt(document.getElementById('rcv-bulk-ledger')?.value, 10);
  const incAcct  = parseInt(document.getElementById('rcv-bulk-income-account')?.value, 10);
  if (!termId||!dueDate||!ledgerId||!incAcct) { showToast('Configuration incomplete.','error'); return; }
  localStorage.setItem('rcv_last_ledger_id', String(ledgerId));
  localStorage.setItem('rcv_last_income_account_id', String(incAcct));
  const payload = { term_id:termId, due_date:dueDate, ledger_id:ledgerId, income_account_id:incAcct };
  if (_rcvBulkStudentIds) payload.student_ids = _rcvBulkStudentIds;
  const res = await apiFetch(`${API_BASE}/receivables/fee-invoices/generate-bulk`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload),
  });
  if (!res || !res.ok) { showToast('Generation failed: '+(res?await parseApiError(res):'network error'),'error'); return; }
  const result = await res.json();
  _rcvRenderBulkResults(result, termId);
}

function _rcvRenderBulkResults(result, termId) {
  const container = document.getElementById('main-content');
  const created = _toArray(result.created||[]);
  const skipped = _toArray(result.skipped||[]);
  const errors  = _toArray(result.errors||[]);
  const createdRows = created.map(r=>`<tr>
    <td>${_finEsc(_rcvStudentName(r.student_id))}</td>
    <td><a href="#" onclick="loadInvoiceDetailView(document.getElementById('main-content'),${r.invoice_id});return false;">${_finEsc(r.invoice_number||`#${r.invoice_id}`)}</a></td>
  </tr>`).join('');
  const errorRows = errors.map(r=>`<tr>
    <td>${_finEsc(_rcvStudentName(r.student_id))}</td>
    <td>${_finEsc(r.reason||'Unknown error')}</td>
    <td><a href="#" onclick="loadView('fin-fee-assignments');return false;">Add assignments &#8594;</a></td>
  </tr>`).join('');
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Bulk Generate — Results</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Bulk Invoice Generate &rsaquo; Results</div>
      </div>
      <details open style="margin-bottom:16px;border:1px solid #d1fae5;border-radius:8px;overflow:hidden;">
        <summary style="background:#d1fae5;color:#065f46;padding:10px 16px;font-weight:600;cursor:pointer;">Generated (${created.length}) ✅</summary>
        ${created.length ? `<div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>STUDENT</th><th>INVOICE NO.</th></tr></thead><tbody>${createdRows}</tbody></table></div>` : '<p style="padding:12px 16px;color:#888;">None.</p>'}
      </details>
      <details style="margin-bottom:16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <summary style="background:#f3f4f6;color:#374151;padding:10px 16px;font-weight:600;cursor:pointer;">Skipped (${skipped.length}) ⚪</summary>
        <p style="padding:12px 16px;color:#374151;margin:0;font-size:0.9rem;">These students already had an open invoice for this term and were not re-invoiced.</p>
      </details>
      ${errors.length ? `<details open style="border:1px solid #fee2e2;border-radius:8px;overflow:hidden;">
        <summary style="background:#fee2e2;color:#991b1b;padding:10px 16px;font-weight:600;cursor:pointer;">Errors (${errors.length}) ❌</summary>
        <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>STUDENT</th><th>REASON</th><th></th></tr></thead><tbody>${errorRows}</tbody></table></div>
      </details>` : ''}
      <div style="margin-top:20px;">
        <button class="fin-btn-teal" onclick="rcvInvLoad();loadView('fin-fee-invoices')">View Invoice List</button>
        <button class="fin-btn-outline" style="margin-left:10px;" onclick="loadBulkInvoiceView(document.getElementById('main-content'))">Generate Again</button>
      </div>
    </div>`;
}
