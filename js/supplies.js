// ==================== STUDENT SUPPLIES (virtual-store, chain-of-custody) ====================
// New module — no legacy FE code existed to migrate, built straight to the
// 2026-07-27 addendum §1 target shape. Two entry points share one renderSplitView
// config builder: a per-student browse/manage view (any staff with student_management
// access) and a homeroom-teacher "My Class Supplies" aggregate (server-gated by
// SchoolClass.homeroom_teacher_id).

let _suppTermsCache = null;
let _suppStudentsCache = null;
let _suppClassesCache = null;

function _suppEsc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function _suppEnsureCaches() {
  const reqs = [];
  if (!_suppTermsCache)    reqs.push(apiFetch(`${API_BASE}/terms`).then(r => r&&r.ok ? r.json() : []).then(d => { _suppTermsCache    = _toArray(d); }));
  if (!_suppStudentsCache) reqs.push(apiFetch(`${API_BASE}/students/`).then(r => r&&r.ok ? r.json() : []).then(d => { _suppStudentsCache = _toArray(d); }));
  if (reqs.length) await Promise.all(reqs);
}

function _suppTermLabel(t) { return t.title || t.name || `Term ${t.id}`; }
function _suppTermName(id) {
  const t = (_suppTermsCache||[]).find(x => String(x.id) === String(id));
  return t ? _suppTermLabel(t) : `#${id}`;
}
// Same "is_current" heuristic used elsewhere in the app (students.js extra-curricular
// term default) — the terms list has no single canonical flag name across endpoints.
function _suppCurrentTermId() {
  const t = (_suppTermsCache||[]).find(x => x.is_current || x.is_active || x.current);
  return t ? t.id : '';
}
function _suppStudentLabel(id) {
  const s = (_suppStudentsCache||[]).find(x => String(x.id) === String(id));
  if (!s) return `#${id}`;
  return `${s.first_name||''} ${s.last_name||''}`.trim() || (s.student_id || `#${id}`);
}

function _suppStatusPill(status) {
  if (status === 'returned') return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:600;color:#666;background:#eee;">Returned</span>`;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:600;color:#fff;background:var(--navy-700,#1B3057);">In Hand</span>`;
}

// Populates a <datalist> with "First Last (admission#)" options and stashes a
// label->id map on window under mapKey — same pattern as the Bus Schedule rider
// datalist (js/transport.js _bsPopulateStudentDatalist), duplicated here rather
// than shared since the two modules resolve against different input ids.
function _suppPopulateStudentDatalist(listId, mapKey) {
  const dl = document.getElementById(listId);
  if (!dl) return;
  window[mapKey] = {};
  dl.innerHTML = (_suppStudentsCache||[]).map(s => {
    const label = `${s.first_name||''} ${s.last_name||''} (${s.student_id||s.id})`.trim();
    window[mapKey][label] = s.id;
    return `<option value="${_suppEsc(label)}"></option>`;
  }).join('');
}
function _suppResolveStudentInput(val, mapKey, hiddenId, onResolved) {
  const id = (window[mapKey]||{})[val];
  const hidden = document.getElementById(hiddenId);
  if (hidden) hidden.value = id || '';
  if (id && typeof onResolved === 'function') onResolved(id);
}

// ── Shared split-view config builder ────────────────────────────────────────────
function _suppBuildCfg(mount, opts) {
  return {
    container: mount,
    title: opts.title,
    moduleKey: 'student_management.supplies',
    breadcrumb: opts.breadcrumb,
    apiUrl: opts.apiUrl,
    searchFields: ['item_name','notes'],
    col1Label: 'Item', col2Label: 'Status',
    col1: s => `<span style="${s.status==='returned'?'opacity:.6;text-decoration:line-through;':''}"><strong>${_suppEsc(s.item_name||'—')}</strong><br><span style="font-weight:400;font-size:12px;color:#888;">${_suppEsc(s.quantity||'')}</span></span>`,
    col2: s => _suppStatusPill(s.status),
    rowLabel: s => s.item_name || '—',
    rowSub: s => `${opts.showStudentCol ? _suppEsc(_suppStudentLabel(s.student_id)) + ' · ' : ''}${s.received_date||''}`,
    idKey: 'id',
    detailFields: [
      ...(opts.showStudentCol ? [{label:'Student', key:'student_id', fmt:v=>_suppStudentLabel(v)}] : []),
      {label:'Item Name',     key:'item_name'},
      {label:'Quantity',      key:'quantity'},
      {label:'Term',          key:'term_id', fmt:v=>v?_suppTermName(v):'—'},
      {label:'Received Date', key:'received_date', fmt:v=>v||'—'},
      {label:'Status',        key:'status', fmt:v=>_suppStatusPill(v)},
      {label:'Returned Date', key:'returned_date', fmt:v=>v||'—'},
      {label:'Notes',         key:'notes', fmt:v=>v||'—'},
    ],
    canEdit: item => item.status === 'in_hand',
    onEdit: item => _suppOpenEditModal(item),
    detailActions: item => _suppDetailActionsHtml(item),
    renderAdd: el => _suppRenderAddForm(el, opts.contextStudentId || null),
  };
}

// Mirrors the CoA subtype-filter injection (js/finance.js _coaInjectSubtypeFilter):
// mutate cfg.apiUrl then call the reload hook renderSplitView already exposes.
function _suppInjectFilters(cfg, opts) {
  const searchBox = document.querySelector('.split-left-search');
  if (!searchBox) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;';
  wrap.innerHTML = `
    <select id="supp-term-filter" class="fin-form-select" style="flex:1;min-width:140px;font-size:12px;">
      <option value="">All Terms</option>
      ${(_suppTermsCache||[]).map(t=>`<option value="${t.id}" ${String(t.id)===String(opts.termId||'')?'selected':''}>${_suppEsc(_suppTermLabel(t))}</option>`).join('')}
    </select>
    <label style="font-size:12px;display:flex;align-items:center;gap:4px;white-space:nowrap;">
      <input type="checkbox" id="supp-include-returned" ${opts.includeReturned!==false?'checked':''}> Include returned
    </label>`;
  searchBox.insertAdjacentElement('afterend', wrap);
  document.getElementById('supp-term-filter').addEventListener('change', () => _suppReapplyFilters(cfg, opts));
  document.getElementById('supp-include-returned').addEventListener('change', () => _suppReapplyFilters(cfg, opts));

  if (opts.unlinkedBaseUrl) {
    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'padding:0 16px 10px;';
    btnWrap.innerHTML = `<button class="fin-btn-outline" style="font-size:12px;" onclick="_suppToggleUnlinkedPanel('${opts.unlinkedBaseUrl}')">View unlinked supplies</button><div id="supp-unlinked-panel"></div>`;
    wrap.insertAdjacentElement('afterend', btnWrap);
  }
}
function _suppReapplyFilters(cfg, opts) {
  const termId = document.getElementById('supp-term-filter')?.value || '';
  const includeReturned = document.getElementById('supp-include-returned')?.checked;
  opts.termId = termId; opts.includeReturned = includeReturned;
  const params = new URLSearchParams();
  if (opts.classId) params.set('class_id', opts.classId);
  if (termId) params.set('term_id', termId);
  if (!includeReturned) params.set('include_returned', 'false');
  const qs = params.toString();
  cfg.apiUrl = opts.baseUrl + (qs ? `?${qs}` : '');
  window._splitReload && window._splitReload();
}

// §1.9 — rows with term_id===null won't surface under any term filter. Fetched
// on demand (same base endpoint, no term_id) and filtered client-side since
// renderSplitView's list has no hook for an arbitrary predicate beyond text search.
async function _suppToggleUnlinkedPanel(baseUrl) {
  const panel = document.getElementById('supp-unlinked-panel');
  if (!panel) return;
  if (panel.dataset.open === '1') { panel.innerHTML = ''; panel.dataset.open = ''; return; }
  panel.dataset.open = '1';
  panel.innerHTML = `<p style="padding:8px 0;color:#888;font-size:12px;">Loading…</p>`;
  const res = await apiFetch(baseUrl);
  const rows = (res && res.ok) ? _toArray(await res.json()).filter(s => s.term_id == null) : [];
  window._suppUnlinkedMap = {};
  rows.forEach(s => { window._suppUnlinkedMap[s.id] = s; });
  panel.innerHTML = `
    <div class="fin-field-hint fin-field-hint-warning">These supplies have no term set. Edit each row to assign one, then the row will re-appear in the term view.</div>
    ${rows.length ? rows.map(s => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border:1px solid #eee;border-radius:6px;margin:6px 0;">
        <div><strong>${_suppEsc(s.item_name||'')}</strong><br><span style="color:#888;font-size:12px;">${_suppEsc(s.quantity||'')} · ${s.received_date||''}</span></div>
        <button class="fin-btn-outline" style="font-size:12px;" onclick="_suppEditUnlinkedById(${s.id})">Edit</button>
      </div>`).join('') : `<p class="fin-empty">No unlinked supplies.</p>`}`;
}
function _suppEditUnlinkedById(id) {
  const item = (window._suppUnlinkedMap||{})[id];
  if (item) _suppOpenEditModal(item);
}

// ── Entry point 1: browse/manage one student's supplies ─────────────────────────
async function loadStudentSuppliesView(container) {
  await _suppEnsureCaches();
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Student Supplies</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; Student Supplies</div>
      </div>
      <div class="fin-form-wrap" style="max-width:420px;margin-bottom:16px;">
        <label class="fin-form-label">Student</label>
        <input type="text" id="supp-student-search" class="fin-search-input" list="supp-student-list"
               placeholder="Search student by name or admission no…"
               oninput="_suppResolveStudentInput(this.value,'_suppOuterMap','supp-student-id',_suppOpenStudentSplit)">
        <datalist id="supp-student-list"></datalist>
        <input type="hidden" id="supp-student-id">
      </div>
      <div id="supp-split-mount"><p class="fin-empty">Select a student above to view and record supplies.</p></div>
    </div>`;
  _suppPopulateStudentDatalist('supp-student-list','_suppOuterMap');
}

async function _suppOpenStudentSplit(studentId) {
  const mount = document.getElementById('supp-split-mount');
  if (!mount) return;
  const label = _suppStudentLabel(studentId);
  const termId = _suppCurrentTermId();
  const baseUrl = `${API_BASE}/supplies/student/${studentId}`;
  const opts = { baseUrl, termId, includeReturned: true, unlinkedBaseUrl: baseUrl };
  const qs = termId ? `?term_id=${termId}` : '';
  const cfg = _suppBuildCfg(mount, {
    title: `Supplies — ${label}`,
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Student Management',view:'students-list'},
      {label:'Student Supplies',view:'student-supplies'},
      {label},
    ],
    apiUrl: baseUrl + qs,
    showStudentCol: false,
    contextStudentId: studentId,
  });
  await renderSplitView(cfg);
  _suppInjectFilters(cfg, opts);
}

// ── Entry point 2: class aggregate (own homerooms by default, or any class
// via the picker — the backend removed the homeroom-only 403 and now scopes
// this purely on the student_management.supplies permission). ─────────────
async function loadMyClassSuppliesView(container) {
  await _suppEnsureCaches();
  if (!_suppClassesCache) {
    const res = await apiFetch(`${API_BASE}/classes/`);
    _suppClassesCache = res && res.ok ? _toArray(await res.json()) : [];
  }
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">My Class Supplies</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Student Management &rsaquo; My Class Supplies</div>
      </div>
      <div class="fin-form-wrap" style="max-width:320px;margin-bottom:16px;">
        <label class="fin-form-label">Class</label>
        <select id="supp-class-picker" class="fin-form-select">
          <option value="">My homeroom classes</option>
          ${_suppClassesCache.map(c => `<option value="${c.id}">${_suppEsc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div id="supp-myclass-mount"></div>
    </div>`;
  document.getElementById('supp-class-picker').addEventListener('change', e => _suppLoadClassSupplies(e.target.value));
  await _suppLoadClassSupplies('');
}

async function _suppLoadClassSupplies(classId) {
  const mount = document.getElementById('supp-myclass-mount');
  if (!mount) return;
  mount.innerHTML = `<p class="fin-loading">Loading…</p>`;
  const baseUrl = `${API_BASE}/supplies/class-supplies`;
  const termId = _suppCurrentTermId();
  const opts = { baseUrl, termId, includeReturned: true, classId };
  const params = new URLSearchParams();
  if (classId) params.set('class_id', classId);
  if (termId) params.set('term_id', termId);
  const qs = params.toString();
  const selectedClass = classId ? _suppClassesCache.find(c => String(c.id) === String(classId)) : null;
  const cfg = _suppBuildCfg(mount, {
    title: selectedClass ? `Supplies — ${selectedClass.name}` : 'My Class Supplies',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Student Management',view:'students-list'},
      {label:'My Class Supplies'},
    ],
    apiUrl: baseUrl + (qs ? `?${qs}` : ''),
    showStudentCol: true,
    contextStudentId: null,
  });
  await renderSplitView(cfg);
  _suppInjectFilters(cfg, opts);
}

// ── Add form ──────────────────────────────────────────────────────────────────
function _suppRenderAddForm(el, contextStudentId) {
  const todayStr = new Date().toISOString().slice(0,10);
  const prefillLabel = contextStudentId ? _suppEsc(_suppStudentLabel(contextStudentId)) : '';
  el.innerHTML = `
    <div class="fin-form-wrap">
      <h3 class="fin-title" style="font-size:1rem;">Record a Supply</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Student <span class="fin-required">*</span></label>
        <input type="text" id="supp-f-student-search" class="fin-search-input" list="supp-f-student-list"
               placeholder="Search student…" value="${prefillLabel}"
               oninput="_suppResolveStudentInput(this.value,'_suppFormMap','supp-f-student-id')">
        <datalist id="supp-f-student-list"></datalist>
        <input type="hidden" id="supp-f-student-id" value="${contextStudentId||''}">
        <span class="fin-field-error" id="supp-f-student-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Item Name <span class="fin-required">*</span></label>
        <input type="text" id="supp-f-item" class="fin-form-input" maxlength="200" placeholder="e.g. Coloured Pencils">
        <span class="fin-field-error" id="supp-f-item-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Quantity <span class="fin-required">*</span></label>
        <input type="text" id="supp-f-qty" class="fin-form-input" maxlength="200" placeholder="e.g. A packet of 12 coloured pencils, 2 black erasers">
        <span class="fin-field-error" id="supp-f-qty-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Term</label>
        <select id="supp-f-term" class="fin-form-select">
          <option value="">— Leave blank for current term —</option>
          ${(_suppTermsCache||[]).map(t=>`<option value="${t.id}">${_suppEsc(_suppTermLabel(t))}</option>`).join('')}
        </select>
        <span class="fin-field-hint fin-field-hint-info">Leave blank to use the current term for this student.</span>
        <span class="fin-field-error" id="supp-f-term-err"></span>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Received Date</label>
        <input type="date" id="supp-f-received" class="fin-form-input" value="${todayStr}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="supp-f-notes" class="fin-form-textarea" rows="3"></textarea>
      </div>
      <div id="supp-f-msg"></div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_suppSubmitAdd()">Save</button>
        <button class="fin-btn-cancel" onclick="window._splitReload && window._splitReload()">Cancel</button>
      </div>
    </div>`;
  _suppPopulateStudentDatalist('supp-f-student-list','_suppFormMap');
}

async function _suppSubmitAdd() {
  const studentId = document.getElementById('supp-f-student-id').value;
  const itemName  = (document.getElementById('supp-f-item').value||'').trim();
  const qty       = (document.getElementById('supp-f-qty').value||'').trim();
  const termId    = document.getElementById('supp-f-term').value;
  const received  = document.getElementById('supp-f-received').value;
  const notes     = (document.getElementById('supp-f-notes').value||'').trim();

  ['student','item','qty','term'].forEach(f => { const e = document.getElementById(`supp-f-${f}-err`); if (e) e.textContent = ''; });
  document.getElementById('supp-f-msg').innerHTML = '';
  let valid = true;
  if (!studentId) { document.getElementById('supp-f-student-err').textContent = 'Select a student.'; valid = false; }
  if (!itemName)  { document.getElementById('supp-f-item-err').textContent = 'This field is required.'; valid = false; }
  if (!qty)       { document.getElementById('supp-f-qty-err').textContent = 'This field is required.'; valid = false; }
  if (!valid) return;

  const payload = {
    student_id: parseInt(studentId),
    item_name: itemName,
    quantity: qty,
    term_id: termId ? parseInt(termId) : null,
    received_date: received || null,
    notes: notes || null,
  };
  const res = await apiFetch(`${API_BASE}/supplies/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (res && res.ok) {
    showToast('Supply recorded.', 'success');
    window._splitReload && await window._splitReload();
    return;
  }
  if (!res) return;
  const detail = await parseApiError(res);
  if (res.status === 400 && /cannot resolve a term/i.test(detail)) {
    document.getElementById('supp-f-term-err').textContent = detail;
  } else if (res.status === 404 || res.status === 403) {
    showToast(detail, 'error');
  } else {
    document.getElementById('supp-f-msg').innerHTML = `<div class="fin-field-error">${_suppEsc(detail)}</div>`;
  }
}

// ── Edit modal (PATCH — in_hand only) ────────────────────────────────────────────
function _suppOpenEditModal(item) {
  const wrap = document.createElement('div');
  wrap.id = 'supp-edit-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:480px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Edit Supply</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Item Name</label>
        <input type="text" id="supp-e-item" class="fin-form-input" maxlength="200" value="${_suppEsc(item.item_name||'')}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Quantity</label>
        <input type="text" id="supp-e-qty" class="fin-form-input" maxlength="200" value="${_suppEsc(item.quantity||'')}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Received Date</label>
        <input type="date" id="supp-e-received" class="fin-form-input" value="${item.received_date||''}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="supp-e-notes" class="fin-form-textarea" rows="3">${_suppEsc(item.notes||'')}</textarea>
      </div>
      <div id="supp-e-msg"></div>
      <div style="display:flex;gap:10px;margin-top:10px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_suppCloseModal('supp-edit-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" onclick="_suppSubmitEdit(${item.id})">Save</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
function _suppCloseModal(id) { document.getElementById(id)?.remove(); }

async function _suppSubmitEdit(id) {
  const payload = {
    item_name:     document.getElementById('supp-e-item').value.trim(),
    quantity:      document.getElementById('supp-e-qty').value.trim(),
    received_date: document.getElementById('supp-e-received').value || null,
    notes:         document.getElementById('supp-e-notes').value.trim(),
  };
  const res = await apiFetch(`${API_BASE}/supplies/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const msgEl = document.getElementById('supp-e-msg');
  if (res && res.ok) {
    showToast('Supply updated.', 'success');
    _suppCloseModal('supp-edit-modal-overlay');
    window._splitRefreshSelected && await window._splitRefreshSelected();
    return;
  }
  if (!res) return;
  const detail = await parseApiError(res);
  if (res.status === 409) {
    msgEl.innerHTML = `<div class="fin-field-error">${_suppEsc(detail)}</div>
      <button class="fin-btn-outline" style="margin-top:8px;font-size:12px;" onclick="_suppGuideUnreturnThenEdit(${id})">Reverse return, then edit</button>`;
  } else {
    msgEl.innerHTML = `<div class="fin-field-error">${_suppEsc(detail)}</div>`;
  }
}
async function _suppGuideUnreturnThenEdit(id) {
  const res = await apiFetch(`${API_BASE}/supplies/${id}/unreturn`, { method: 'POST' });
  if (res && res.ok) {
    showToast('Return reversed — record is in-hand again.', 'success');
    _suppCloseModal('supp-edit-modal-overlay');
    window._splitRefreshSelected && await window._splitRefreshSelected();
  } else if (res) {
    showToast(await parseApiError(res), 'error');
  }
}

// ── Detail-pane lifecycle actions (Return / Reverse Return / Delete) ────────────
// cfg.detailActions(item) is invoked by renderSplitView with the full selected
// record — stash it so the id-only onclick handlers below (see the dashboard.js
// comment on why string ids can't ride inline JSON.stringify safely) can read
// item_name for confirm() copy without re-fetching or escaping into an attribute.
function _suppDetailActionsHtml(item) {
  window._suppCurrentItem = item;
  const msgDivId = `supp-action-msg-${item.id}`;
  if (item.status === 'in_hand') {
    return `
      <button class="fin-btn-outline" onclick="_suppOpenReturnModal(${item.id})">Return to Parent</button>
      <button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_suppDeleteSupply(${item.id})">Delete</button>
      <div id="${msgDivId}" style="margin-top:8px;"></div>`;
  }
  if (item.status === 'returned') {
    return `
      <button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_suppReverseReturn(${item.id})">Reverse Return</button>
      <div id="${msgDivId}" style="margin-top:8px;"></div>`;
  }
  return '';
}

function _suppOpenReturnModal(id) {
  const todayStr = new Date().toISOString().slice(0,10);
  const wrap = document.createElement('div');
  wrap.id = 'supp-return-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:440px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 10px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Return to Parent</h3>
      <p style="font-size:0.85rem;color:#666;margin:0 0 14px;">This records custody transfer back to the parent. The record stays on file — it is not deleted.</p>
      <div class="fin-form-group">
        <label class="fin-form-label">Returned Date</label>
        <input type="date" id="supp-r-date" class="fin-form-input" value="${todayStr}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="supp-r-notes" class="fin-form-textarea" rows="2"></textarea>
      </div>
      <div id="supp-r-msg"></div>
      <div style="display:flex;gap:10px;margin-top:10px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_suppCloseModal('supp-return-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" onclick="_suppSubmitReturn(${id})">Confirm Return</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}
async function _suppSubmitReturn(id) {
  const payload = {
    returned_date: document.getElementById('supp-r-date').value || null,
    notes: document.getElementById('supp-r-notes').value.trim() || null,
  };
  const res = await apiFetch(`${API_BASE}/supplies/${id}/return`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (res && res.ok) {
    showToast('Marked returned to parent.', 'success');
    _suppCloseModal('supp-return-modal-overlay');
    window._splitRefreshSelected && await window._splitRefreshSelected();
    return;
  }
  if (res) document.getElementById('supp-r-msg').innerHTML = `<div class="fin-field-error">${_suppEsc(await parseApiError(res))}</div>`;
}

async function _suppReverseReturn(id) {
  const itemName = window._suppCurrentItem?.item_name || '';
  if (!confirm(`Reverse the return of '${itemName}'? This will flip the record back to in-hand and log the reversal.`)) return;
  const res = await apiFetch(`${API_BASE}/supplies/${id}/unreturn`, { method: 'POST' });
  if (res && res.ok) {
    showToast('Return reversed.', 'success');
    window._splitRefreshSelected && await window._splitRefreshSelected();
  } else if (res) {
    const el = document.getElementById(`supp-action-msg-${id}`);
    const detail = await parseApiError(res);
    if (el) el.innerHTML = `<div class="fin-field-error">${_suppEsc(detail)}</div>`; else showToast(detail, 'error');
  }
}

async function _suppDeleteSupply(id) {
  const itemName = window._suppCurrentItem?.item_name || '';
  if (!confirm(`Delete supply "${itemName}"? This cannot be undone.`)) return;
  const res = await apiFetch(`${API_BASE}/supplies/${id}`, { method: 'DELETE' });
  if (res && res.ok) {
    showToast('Supply deleted.', 'success');
    window._splitReload && await window._splitReload();
    return;
  }
  if (!res) return;
  const detail = await parseApiError(res);
  const el = document.getElementById(`supp-action-msg-${id}`);
  if (res.status === 409 && el) {
    el.innerHTML = `<div class="fin-field-error">${_suppEsc(detail)}</div>
      <button class="fin-btn-outline" style="margin-top:6px;font-size:12px;" onclick="_suppGuideUnreturnThenDelete(${id})">Reverse return, then delete</button>`;
  } else {
    showToast(detail, 'error');
  }
}
async function _suppGuideUnreturnThenDelete(id) {
  const res = await apiFetch(`${API_BASE}/supplies/${id}/unreturn`, { method: 'POST' });
  if (res && res.ok) {
    showToast('Return reversed — you can now delete.', 'success');
    window._splitRefreshSelected && await window._splitRefreshSelected();
  } else if (res) {
    showToast(await parseApiError(res), 'error');
  }
}
