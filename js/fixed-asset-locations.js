// ==================== FIXED ASSETS — BY LOCATION & CLASS SUMMARY ====================
// Movement Log spec §5/§6. Both read the register's cached placement
// (current_school_class_id / current_location_text):
//   GET /fixed-assets/by-location?class_id=X  or  ?location=<text>
//       [&include_disposed=true] → FixedAssetRead[]. Exactly one of the two;
//       location is a case-insensitive substring of current_location_text.
//       Rejected assets never appear.
//   GET /fixed-assets/summary-by-class/{class_id} → ClassAssetSummary: one row
//       per category with a count and Σ acquisition_cost (decimal strings).
//       Rejected and disposed assets are excluded.
// The app has no class detail page, so the printable summary opens from the
// Classes pane (Student Management) and from a classroom filter here.

let _falMode = 'class';          // 'class' | 'text'
let _falClassId = '';
let _falText = '';
let _falIncludeDisposed = false;
let _falItems = [];
let _falSeq = 0;                 // a response is dropped once a newer query has started
let _falDebounce = null;

// The global input rule makes every input a full-width block.
const _FAL_INLINE_INPUT = 'width:auto;max-width:none;margin:0 6px 0 0;padding:0;display:inline-block;vertical-align:middle;cursor:pointer;accent-color:var(--navy-700);';

async function loadAssetsByLocationView(container) {
  container.innerHTML = `<p style="color:#888;padding:20px;">Loading&#8230;</p>`;
  await Promise.all([_faEnsurePlacementLookups(), _acLoadCategories()]);
  const radio = (mode, label) => `<label style="display:inline-flex;align-items:center;margin-right:18px;cursor:pointer;font-size:0.9rem;">
      <input type="radio" name="fal-mode" value="${mode}" style="${_FAL_INLINE_INPUT}" ${_falMode === mode ? 'checked' : ''} onchange="_falSetMode('${mode}')">${label}</label>`;
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Assets by Location</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Assets &rsaquo; Assets by Location</div>
      </div>
      <div class="fin-filter-section">
        <div role="radiogroup" aria-label="Filter by" style="margin-bottom:12px;">${radio('class', 'By classroom')}${radio('text', 'By location text')}</div>
        <div style="display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;">
          <div id="fal-class-wrap" style="flex:1;min-width:240px;max-width:360px;">${_invClassPickerHtml('fal-class', _falClassId)}</div>
          <div id="fal-text-wrap" style="flex:1;min-width:240px;max-width:360px;">
            <input type="text" id="fal-text" class="fin-form-input" maxlength="120" placeholder="e.g. Head Office, Storage" aria-label="Location text"
              value="${_finEsc(_falText)}" oninput="_falTextChanged(this.value)">
          </div>
          <label style="display:inline-flex;align-items:center;cursor:pointer;font-size:0.9rem;">
            <input type="checkbox" id="fal-disposed" style="${_FAL_INLINE_INPUT}" ${_falIncludeDisposed ? 'checked' : ''} onchange="_falToggleDisposed(this.checked)">Include disposed</label>
        </div>
      </div>
      <div id="fal-results"></div>
    </div>`;
  const sel = document.getElementById('fal-class');
  // The shared picker brings its own "School Class *" label; the radio already
  // says what this is.
  sel.previousElementSibling?.remove();
  sel.setAttribute('aria-label', 'Classroom');
  sel.addEventListener('change', e => { _falClassId = e.target.value; _falLoad(); });
  _falApplyMode();
  await _falLoad();
}

function _falApplyMode() {
  document.getElementById('fal-class-wrap').style.display = _falMode === 'class' ? '' : 'none';
  document.getElementById('fal-text-wrap').style.display = _falMode === 'text' ? '' : 'none';
}
function _falSetMode(mode) {
  _falMode = mode;
  _falApplyMode();
  if (mode === 'text') document.getElementById('fal-text')?.focus();
  _falLoad();
}
// Typing waits for a 300ms pause before querying.
function _falTextChanged(value) {
  _falText = value;
  clearTimeout(_falDebounce);
  _falDebounce = setTimeout(_falLoad, 300);
}
function _falToggleDisposed(on) {
  _falIncludeDisposed = on;
  _falLoad();
}

async function _falLoad() {
  clearTimeout(_falDebounce);
  const el = document.getElementById('fal-results');
  if (!el) return;
  const seq = ++_falSeq;
  const q = _falText.trim();
  if (_falMode === 'class' ? !_falClassId : !q) {
    _falItems = [];
    el.innerHTML = `<p style="padding:24px;text-align:center;color:var(--grey-600,#666);">${_falMode === 'class'
      ? 'Pick a classroom to see the assets currently placed in it.'
      : 'Type part of a location name, e.g. &ldquo;Storage&rdquo;.'}</p>`;
    return;
  }
  const params = new URLSearchParams();
  if (_falMode === 'class') params.set('class_id', _falClassId);
  else params.set('location', q);
  if (_falIncludeDisposed) params.set('include_disposed', 'true');
  el.innerHTML = `<p style="color:#888;padding:12px 0;">Loading&#8230;</p>`;
  const res = await apiFetch(`${_FA_API}/by-location?${params.toString()}`);
  const body = res && res.ok ? _toArray(await res.json()) : null;
  const error = body ? '' : (res ? await parseApiError(res) : 'The server could not be reached.');
  const out = document.getElementById('fal-results');
  if (seq !== _falSeq || !out) return;
  if (!body) {
    _falItems = [];
    out.innerHTML = `<div style="padding:10px 14px;border-radius:6px;background:var(--coral-100);color:var(--coral-600);font-size:0.88rem;">Could not load assets: ${_finEsc(error)}</div>`;
    return;
  }
  _falItems = body;
  _falItems.forEach(_faRememberAsset);
  _falRender();
}

function _falRender() {
  const el = document.getElementById('fal-results');
  if (!el) return;
  const byText = _falMode === 'text';
  const n = _falItems.length;
  const where = byText
    ? `whose location contains &ldquo;${_finEsc(_falText.trim())}&rdquo;`
    : `in ${_finEsc(_invClassLabel(_falClassId))}`;
  const head = `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
      <span style="font-size:0.85rem;color:var(--grey-600,#666);">${n} asset${n === 1 ? '' : 's'} ${where}</span>
      ${byText ? '' : `<button class="fin-btn-outline" style="padding:6px 14px!important;font-size:0.85rem;" onclick="openClassAssetSummary(${Number(_falClassId)})">Print Class Summary</button>`}
    </div>`;
  if (!n) {
    el.innerHTML = `${head}<div style="padding:28px 12px;text-align:center;color:var(--grey-600,#666);font-size:0.9rem;">No assets at this location.
      <div style="margin-top:8px;"><a href="#" onclick="loadView('finance-fixed-assets');return false;">Open the Fixed Asset Register</a></div></div>`;
    return;
  }
  const pill = (label, colors) => `<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:9px;font-size:0.68rem;font-weight:700;vertical-align:middle;${colors}">${label}</span>`;
  const btn = 'padding:4px 12px!important;font-size:0.8rem;';
  const rows = _falItems.map(a => {
    const custodian = _faCustodianName(a.current_custodian_employee_id);
    const flag = a.is_disposed ? pill('Disposed', 'color:#fff;background:var(--coral-500,#D94040);')
      : a.status === 'draft' ? pill('Draft', 'color:#8a6d00;background:#f5e6a8;') : '';
    // Same gate as the register's movement buttons; a disposed asset only
    // accepts verification.
    const move = !_faCanMove(a) ? ''
      : a.is_disposed ? `<button class="fin-btn-outline" style="${btn}" onclick="_faOpenMovementModal(${a.id}, 'verification')">Verify</button>`
      : `<button class="fin-btn-outline" style="${btn}" onclick="_faOpenMovementModal(${a.id}, 'transfer')">Move</button>`;
    return `<tr data-id="${a.id}">
      <td style="white-space:nowrap;"><strong>${_finEsc(a.asset_tag || '—')}</strong>${flag}</td>
      <td>${a.description ? _faTrunc(a.description, 50) : _FA_MUTED_DASH}</td>
      <td>${_finEsc(_acCategoryName(a.category_id))}</td>
      ${byText ? `<td>${_faPlacementCell(null, a.current_location_text)}</td>` : ''}
      <td>${custodian ? _finEsc(custodian) : _FA_MUTED_DASH}</td>
      <td style="text-align:right;white-space:nowrap;">${_faMoney(a.acquisition_cost)}</td>
      <td style="text-align:right;white-space:nowrap;"><span style="display:inline-flex;gap:6px;">
        <button class="fin-btn-outline" style="${btn}" onclick="_faOpenInRegister(${a.id})">View</button>${move}</span></td>
    </tr>`;
  }).join('');
  // A substring search can match several places, so the text view names each.
  el.innerHTML = `${head}<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>ASSET TAG</th><th>DESCRIPTION</th><th>CATEGORY</th>${byText ? '<th>LOCATION</th>' : ''}<th>CUSTODIAN</th><th style="text-align:right;">ACQUISITION COST</th><th style="text-align:right;">ACTIONS</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ── Class Asset Summary (printable) ──────────────────────────────────────
// For the term-open hand-over: the homeroom teacher and bursar sign a printed
// copy. window.open runs before any await so the popup blocker still counts it
// as part of the click.
async function openClassAssetSummary(classId) {
  const win = window.open('', '_blank');
  if (!win) { showToast('Please allow pop-ups to open the class asset summary.', 'error'); return; }
  win.document.write('<p style="font-family:Arial,sans-serif;padding:24px;color:#888;">Loading class asset summary&#8230;</p>');
  let summary = null;
  let error = '';
  try {
    const res = await apiFetch(`${_FA_API}/summary-by-class/${encodeURIComponent(classId)}`);
    if (res && res.ok) summary = await res.json();
    else error = res ? await parseApiError(res) : 'The server could not be reached.';
  } catch (_) {
    error = 'The server could not be reached.';
  }
  if (win.closed) return;
  win.document.open();
  win.document.write(summary ? _falSummaryDocHtml(summary) : `<html><head><title>Class Asset Summary</title></head>
    <body style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:30px auto;padding:0 16px;">
      <h2 style="color:#1d2d50;">Could not load the class asset summary</h2>
      <p style="color:#c0392b;">${_finEsc(error)}</p>
    </body></html>`);
  win.document.close();
}

// Same standalone-document look as the receipt (openReceiptPdf): navy
// #1d2d50, gold #c9a227. Totals are the server's, shown as sent.
function _falSummaryDocHtml(s) {
  const rows = _toArray(s.rows);
  const count = Number(s.total_asset_count) || 0;
  const name = s.school_class_name || _invClassLabel(s.school_class_id);
  const printedOn = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const body = rows.length
    ? rows.map(r => `<tr>
        <td>${_finEsc(r.category_code ? `${r.category_code} — ${r.category_name}` : r.category_name)}</td>
        <td class="num">${Number(r.asset_count) || 0}</td>
        <td class="num">${_finEsc(formatKES(r.total_acquisition_cost))}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" class="empty">No assets are currently placed in this class.</td></tr>`;
  const sign = role => `<div class="sign">
      <div class="sign-line"><span>${role}:</span><span class="line"></span></div>
      <div class="sign-line"><span>Date:</span><span class="line short"></span></div>
    </div>`;
  return `<html><head><title>Class Asset Summary - ${_finEsc(name)}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#222;max-width:760px;margin:30px auto;padding:0 16px;}
      h1{color:#1d2d50;text-align:center;margin:0 0 4px;font-size:1.5rem;}
      .rule{border:none;border-top:3px solid #c9a227;margin:10px 0 16px;}
      .doc-title{text-align:center;font-weight:700;margin-bottom:6px;}
      .headline{text-align:center;font-size:1.05rem;margin:0 0 4px;}
      .meta{text-align:center;color:#666;font-size:0.8rem;margin:0 0 16px;}
      table{width:100%;border-collapse:collapse;border:1px solid #d8d8d8;}
      th{background:#1d2d50;color:#fff;text-align:left;padding:10px 16px;}
      td{padding:9px 16px;border-bottom:1px solid #eee;font-size:0.9rem;}
      th.num,td.num{text-align:right;}
      td.empty{text-align:center;color:#777;padding:18px;}
      tfoot td{background:#c9a227;font-weight:700;border-bottom:none;}
      .note{font-size:0.75rem;color:#777;margin:8px 0 0;}
      .signatures{display:flex;gap:48px;margin-top:56px;}
      .sign{flex:1;font-size:0.9rem;}
      .sign-line{display:flex;align-items:flex-end;gap:8px;margin-bottom:26px;}
      .line{flex:1;border-bottom:1px solid #222;height:1.1em;}
      .line.short{flex:0 0 120px;}
      @page{margin:16mm;}
      @media print{.no-print{display:none;} body{margin:0 auto;} th,tfoot td{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
    </style></head>
    <body>
      <h1>Seven Oaks International School</h1>
      <hr class="rule">
      <div class="doc-title">Class Asset Summary</div>
      <p class="headline">${_finEsc(name)} &mdash; ${count} asset${count === 1 ? '' : 's'}, ${_finEsc(formatKES(s.total_acquisition_cost))}</p>
      <p class="meta">Printed on ${_finEsc(printedOn)}</p>
      <table>
        <thead><tr><th>Category</th><th class="num">Count</th><th class="num">&Sigma; Acquisition Cost</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${count}</td><td class="num">${_finEsc(formatKES(s.total_acquisition_cost))}</td></tr></tfoot>
      </table>
      <p class="note">Assets the register currently places in this class. Rejected and disposed assets are not included.</p>
      <div class="signatures">${sign('Homeroom Teacher')}${sign('Bursar')}</div>
      <div class="no-print" style="text-align:center;margin-top:20px;">
        <button onclick="window.print()" style="padding:8px 22px;font-size:0.95rem;">Print</button>
      </div>
    </body></html>`;
}
