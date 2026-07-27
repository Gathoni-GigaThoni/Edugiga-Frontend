// ==================== COMMUNICATION — PARENT DOCUMENTS ====================
// Staff CRUD for newsletters/term calendars/general documents pushed to the
// parent portal. New module — the Communication rail item was previously a
// bare "under construction" placeholder (js/dashboard.js). Confirmed live
// against openapi.json 2026-07-27: POST/GET /api/communication/documents/,
// GET/PATCH/DELETE /api/communication/documents/{id}, schema ParentDocument*.

let _cdLevelsCache = null;

function _cdEsc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function _cdEnsureLevelsCache() {
  if (_cdLevelsCache) return;
  const res = await apiFetch(`${API_BASE}/academic-levels/`);
  _cdLevelsCache = (res && res.ok) ? _toArray(await res.json()) : [];
}
function _cdLevelName(id) {
  const l = (_cdLevelsCache||[]).find(x => String(x.id) === String(id));
  if (!l) return `#${id}`;
  return typeof academicLevelDisplayName === 'function' ? academicLevelDisplayName(l) : (l.name || `#${id}`);
}
function _cdLevelOptionsHtml(selectedIds) {
  const sel = (selectedIds||[]).map(String);
  return (_cdLevelsCache||[]).map(l =>
    `<option value="${l.id}" ${sel.includes(String(l.id))?'selected':''}>${_cdEsc(_cdLevelName(l.id))}</option>`).join('');
}

const _CD_TYPE_LABELS = { newsletter: 'Newsletter', term_calendar: 'Term Calendar', general: 'General' };
const _CD_TYPE_COLORS = {
  newsletter:    'color:#8a6d00;background:#f5e6a8;',
  term_calendar: 'color:#fff;background:var(--navy-700,#1B3057);',
  general:       'color:#555;background:#eee;',
};
function _cdTypePill(type) {
  const label = _CD_TYPE_LABELS[type] || type || '—';
  const style = _CD_TYPE_COLORS[type] || 'color:#555;background:#eee;';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:600;${style}">${_cdEsc(label)}</span>`;
}
function _cdArchivedPill() {
  return `<span style="display:inline-block;margin-left:4px;padding:2px 8px;border-radius:10px;font-size:0.72rem;font-weight:600;color:#666;background:#eee;">Archived</span>`;
}

// ── Listing (split-view) ─────────────────────────────────────────────────────
async function loadParentDocumentsView(container) {
  await _cdEnsureLevelsCache();
  const cfg = {
    container,
    title: 'Parent Documents',
    moduleKey: 'communication',
    breadcrumb: [
      {label:'Dashboard',view:null},
      {label:'Communication',view:'communication'},
      {label:'Parent Documents'},
    ],
    apiUrl: `${API_BASE}/communication/documents/?is_active=true`,
    searchFields: ['title'],
    col1Label: 'Title', col2Label: 'Type',
    col1: d => `<span style="${d.is_active===false?'opacity:.6;':''}"><strong>${_cdEsc(d.title||'—')}</strong></span>`,
    col2: d => _cdTypePill(d.document_type) + (d.is_active===false ? _cdArchivedPill() : ''),
    rowLabel: d => d.title || '—',
    rowSub: d => d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : '',
    idKey: 'id',
    detailFields: [
      {label:'Title',       key:'title'},
      {label:'Type',        key:'document_type', fmt:v=>_cdTypePill(v)},
      {label:'Description', key:'description', fmt:v=>v||'—'},
      {label:'Scope',       key:'is_global', fmt:(v,d)=> v ? 'Global' : ((d.academic_level_ids||[]).map(id=>_cdLevelName(id)).join(', ') || '—')},
      {label:'Uploaded At', key:'uploaded_at', fmt:v=>v?new Date(v).toLocaleString():'—'},
      {label:'Status',      key:'is_active', fmt:v=>v===false?'Archived':'Active'},
    ],
    canEdit: item => item.is_active !== false,
    renderAdd: el => _cdRenderAddForm(el),
    renderEdit: (item, el) => _cdRenderEditForm(item, el),
    detailActions: item => item.is_active !== false
      ? `<button class="fin-btn-outline" style="color:#c0392b;border-color:#c0392b;" onclick="_cdDeleteDocument(${item.id})">Archive</button><div id="cd-action-msg-${item.id}" style="margin-top:8px;"></div>`
      : '',
  };
  await renderSplitView(cfg);
  _cdInjectFilters(cfg);
}

// Mirrors the CoA subtype-filter injection (js/finance.js _coaInjectSubtypeFilter).
function _cdInjectFilters(cfg) {
  const searchBox = document.querySelector('.split-left-search');
  if (!searchBox) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;';
  wrap.innerHTML = `
    <select id="cd-type-filter" class="fin-form-select" style="flex:1;min-width:140px;font-size:12px;">
      <option value="">All Types</option>
      <option value="newsletter">Newsletter</option>
      <option value="term_calendar">Term Calendar</option>
      <option value="general">General</option>
    </select>
    <label style="font-size:12px;display:flex;align-items:center;gap:4px;white-space:nowrap;">
      <input type="checkbox" id="cd-active-filter" checked> Active only
    </label>`;
  searchBox.insertAdjacentElement('afterend', wrap);
  document.getElementById('cd-type-filter').addEventListener('change', () => _cdReapplyFilters(cfg));
  document.getElementById('cd-active-filter').addEventListener('change', () => _cdReapplyFilters(cfg));
}
function _cdReapplyFilters(cfg) {
  const type = document.getElementById('cd-type-filter')?.value || '';
  const activeOnly = document.getElementById('cd-active-filter')?.checked;
  const params = new URLSearchParams();
  if (type) params.set('document_type', type);
  if (activeOnly) params.set('is_active', 'true');
  const qs = params.toString();
  cfg.apiUrl = `${API_BASE}/communication/documents/` + (qs ? `?${qs}` : '');
  window._splitReload && window._splitReload();
}

// ── Shared field HTML (Add includes the file picker; Edit never re-uploads —
// ParentDocumentUpdate has no file_path field at all) ────────────────────────
function _cdFieldsHtml(item, includeFile) {
  return `
    <div class="fin-form-group">
      <label class="fin-form-label">Title <span class="fin-required">*</span></label>
      <input type="text" id="cd-f-title" class="fin-form-input" maxlength="200" value="${_cdEsc(item?.title||'')}">
      <span class="fin-field-error" id="cd-f-title-err"></span>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Type <span class="fin-required">*</span></label>
      <select id="cd-f-type" class="fin-form-select">
        <option value="">— Select —</option>
        ${Object.entries(_CD_TYPE_LABELS).map(([v,l])=>`<option value="${v}" ${item?.document_type===v?'selected':''}>${l}</option>`).join('')}
      </select>
      <span class="fin-field-error" id="cd-f-type-err"></span>
    </div>
    ${includeFile ? `
    <div class="fin-form-group">
      <label class="fin-form-label">File <span class="fin-required">*</span></label>
      <input type="file" id="cd-f-file-input" onchange="_cdHandleFileSelect(this)">
      <input type="hidden" id="cd-f-file-path">
      <div id="cd-f-file-status" class="fin-field-hint fin-field-hint-info" style="display:none;"></div>
      <span class="fin-field-error" id="cd-f-file-err"></span>
    </div>` : ''}
    <div class="fin-form-group">
      <label class="fin-form-label">Description</label>
      <textarea id="cd-f-description" class="fin-form-textarea" rows="3">${_cdEsc(item?.description||'')}</textarea>
    </div>
    <div class="fin-form-group">
      <label class="fin-form-label">Scope <span class="fin-required">*</span></label>
      <div style="display:flex;gap:6px;">
        <button type="button" id="cd-f-scope-global" class="fin-btn-outline" onclick="_cdSetScope('global')">Global</button>
        <button type="button" id="cd-f-scope-specific" class="fin-btn-outline" onclick="_cdSetScope('specific')">Specific levels</button>
      </div>
      <div id="cd-f-levels-wrap" style="display:none;margin-top:8px;">
        <select id="cd-f-levels" class="fin-form-select" multiple size="6">${_cdLevelOptionsHtml(item?.academic_level_ids)}</select>
        <span class="fin-field-error" id="cd-f-levels-err"></span>
      </div>
    </div>`;
}

function _cdSetScope(mode) {
  window._cdScope = mode;
  const gBtn = document.getElementById('cd-f-scope-global');
  const sBtn = document.getElementById('cd-f-scope-specific');
  if (gBtn) gBtn.className = mode === 'global' ? 'fin-btn-teal' : 'fin-btn-outline';
  if (sBtn) sBtn.className = mode === 'specific' ? 'fin-btn-teal' : 'fin-btn-outline';
  const wrap = document.getElementById('cd-f-levels-wrap');
  if (wrap) wrap.style.display = mode === 'specific' ? 'block' : 'none';
}

async function _cdHandleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('cd-f-file-status');
  statusEl.style.display = 'block';
  statusEl.className = 'fin-field-hint fin-field-hint-info';
  statusEl.textContent = 'Uploading…';
  const url = await uploadFile(file);
  if (url) {
    document.getElementById('cd-f-file-path').value = url;
    statusEl.textContent = `Uploaded: ${file.name}`;
  } else {
    statusEl.className = 'fin-field-error';
    statusEl.textContent = 'Upload failed — please try again.';
  }
}

// ── Add ───────────────────────────────────────────────────────────────────────
function _cdRenderAddForm(el) {
  window._cdScope = 'global';
  el.innerHTML = `
    <div class="fin-form-wrap">
      <h3 class="fin-title" style="font-size:1rem;">Add a Document</h3>
      ${_cdFieldsHtml(null, true)}
      <div id="cd-f-msg"></div>
      <div class="fin-form-actions">
        <button class="fin-btn-teal" onclick="_cdSubmitAdd()">Save</button>
        <button class="fin-btn-cancel" onclick="window._splitReload && window._splitReload()">Cancel</button>
      </div>
    </div>`;
  _cdSetScope('global');
}

async function _cdSubmitAdd() {
  const title       = (document.getElementById('cd-f-title').value||'').trim();
  const type        = document.getElementById('cd-f-type').value;
  const filePath    = document.getElementById('cd-f-file-path').value;
  const description = (document.getElementById('cd-f-description').value||'').trim();
  const scope       = window._cdScope || 'global';
  const levelIds    = scope === 'specific'
    ? Array.from(document.getElementById('cd-f-levels').selectedOptions).map(o => parseInt(o.value))
    : [];

  ['title','type','file','levels'].forEach(f => { const e = document.getElementById(`cd-f-${f}-err`); if (e) e.textContent = ''; });
  document.getElementById('cd-f-msg').innerHTML = '';
  let valid = true;
  if (!title)    { document.getElementById('cd-f-title-err').textContent = 'This field is required.'; valid = false; }
  if (!type)     { document.getElementById('cd-f-type-err').textContent  = 'This field is required.'; valid = false; }
  if (!filePath) { document.getElementById('cd-f-file-err').textContent  = 'Please upload a file.'; valid = false; }
  if (scope === 'specific' && levelIds.length === 0) {
    document.getElementById('cd-f-levels-err').textContent = 'A document must either be global or target at least one academic level.';
    valid = false;
  }
  if (!valid) return;

  const payload = {
    title, document_type: type, file_path: filePath,
    description: description || null,
    is_global: scope === 'global',
    academic_level_ids: scope === 'global' ? [] : levelIds,
  };
  const res = await apiFetch(`${API_BASE}/communication/documents/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (res && res.ok) {
    showToast('Document added.', 'success');
    window._splitReload && await window._splitReload();
    return;
  }
  if (!res) return;
  const detail = await parseApiError(res);
  if (res.status === 400 && /academic level/i.test(detail)) document.getElementById('cd-f-levels-err').textContent = detail;
  else if (res.status === 404) showToast(detail, 'error');
  else document.getElementById('cd-f-msg').innerHTML = `<div class="fin-field-error">${_cdEsc(detail)}</div>`;
}

// ── Edit (full-window, PATCH — no file re-upload) ────────────────────────────
function _cdRenderEditForm(item, el) {
  el.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Edit Document</h2>
        <div class="fin-breadcrumb">
          Dashboard &rsaquo; Communication &rsaquo;
          <a href="#" class="fin-bc-link" onclick="loadView('communication-parent-documents');return false;">Parent Documents</a>
          &rsaquo; Edit
        </div>
      </div>
      <div class="fin-form-wrap" style="max-width:680px;">
        ${_cdFieldsHtml(item, false)}
        <div id="cd-e-msg"></div>
        <div class="fin-form-actions">
          <button class="fin-btn-teal" onclick="_cdSubmitEdit(${item.id})">Update</button>
          <button class="fin-btn-cancel" onclick="window._splitReload && window._splitReload()">Cancel</button>
        </div>
      </div>
    </div>`;
  _cdSetScope(item.is_global ? 'global' : 'specific');
}

async function _cdSubmitEdit(id) {
  const title       = (document.getElementById('cd-f-title').value||'').trim();
  const type        = document.getElementById('cd-f-type').value;
  const description = (document.getElementById('cd-f-description').value||'').trim();
  const scope       = window._cdScope || 'global';
  const levelIds    = scope === 'specific'
    ? Array.from(document.getElementById('cd-f-levels').selectedOptions).map(o => parseInt(o.value))
    : [];

  ['title','type','levels'].forEach(f => { const e = document.getElementById(`cd-f-${f}-err`); if (e) e.textContent = ''; });
  document.getElementById('cd-e-msg').innerHTML = '';
  let valid = true;
  if (!title) { document.getElementById('cd-f-title-err').textContent = 'This field is required.'; valid = false; }
  if (!type)  { document.getElementById('cd-f-type-err').textContent  = 'This field is required.'; valid = false; }
  if (scope === 'specific' && levelIds.length === 0) {
    document.getElementById('cd-f-levels-err').textContent = 'A document must either be global or target at least one academic level.';
    valid = false;
  }
  if (!valid) return;

  // Never submit both is_global:true and a non-empty levels array — the
  // Scope control is the single source of truth for which payload goes out.
  const payload = {
    title, document_type: type,
    description: description || null,
    is_global: scope === 'global',
    academic_level_ids: scope === 'global' ? [] : levelIds,
  };
  const res = await apiFetch(`${API_BASE}/communication/documents/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (res && res.ok) {
    showToast('Document updated.', 'success');
    window._splitRefreshSelected && await window._splitRefreshSelected();
    return;
  }
  if (!res) return;
  const detail = await parseApiError(res);
  if (res.status === 400 && /academic level/i.test(detail)) document.getElementById('cd-f-levels-err').textContent = detail;
  else if (res.status === 404) showToast(detail, 'error');
  else document.getElementById('cd-e-msg').innerHTML = `<div class="fin-field-error">${_cdEsc(detail)}</div>`;
}

// ── Archive (soft delete) ─────────────────────────────────────────────────────
async function _cdDeleteDocument(id) {
  if (!confirm('Archive this document? Parents will stop seeing it immediately; the record is kept for audit.')) return;
  const res = await apiFetch(`${API_BASE}/communication/documents/${id}`, { method: 'DELETE' });
  if (res && (res.ok || res.status === 204)) {
    showToast('Document archived.', 'success');
    window._splitReload && await window._splitReload();
    return;
  }
  if (!res) return;
  const detail = await parseApiError(res);
  const el = document.getElementById(`cd-action-msg-${id}`);
  if (el) el.innerHTML = `<div class="fin-field-error">${_cdEsc(detail)}</div>`;
  else showToast(detail, 'error');
}
