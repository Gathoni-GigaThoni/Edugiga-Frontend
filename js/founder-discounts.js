// ==================== FOUNDER'S DISCOUNTS ====================
// Finance ▸ Set-up ▸ Founder's Discounts — discretionary per-student grants
// scoped to (student, fee item, academic year): a flat KES amount or a percent
// in (0, 100], stacked on top of any sibling discount. Built to BE 4f191b4,
// checked against live openapi.json and app/routers/fin_founder_discounts.py
// on 2026-09-14:
//
//   * Create, edit and cancel need finance.setup; /pending-approval, /approve,
//     /reject and /apply-to-invoice need finance.cancellations; the list,
//     detail, /applications and /config take either (require_permission maps
//     GET→can_view, POST→can_add, PATCH→can_edit, DELETE→can_delete).
//   * Above FOUNDER_DISCOUNT_APPROVAL_THRESHOLD a grant is PENDING until
//     someone other than its creator approves it (approve/reject 403 for the
//     creator). At or below it, the BE working tree of 2026-09-14 approves on
//     save with the creator as approver of record and re-runs the check when an
//     edit changes the amount; the BE deployed that day still saved DRAFT.
//     /config shipped in the same change, so whether it answers is how this
//     module tells the two apart (_founderConfig.fromServer).
//   * DELETE is a soft cancel (status=cancelled, is_active=false); discounts
//     already on invoices stay where they are.
//   * Invoice generation picks up an APPROVED grant by itself. Apply to Invoice
//     is for invoices issued before the grant was approved.

const _FOUNDER_API = `${API_BASE}/receivables/setup/founder-discounts`;
// GET /config ({approval_threshold, currency}) is in the BE working tree but not
// on live openapi.json (checked 2026-09-14). Until it answers, the form previews
// against the env default and the older draft-on-save rules. The status the
// server returns on save is what actually decides, and the toast reports that.
const _FOUNDER_DEFAULT_CONFIG = { threshold: 5000, currency: 'KES', fromServer: false };
let _founderConfig = null;
const _FOUNDER_STATUS_STYLES = {
  draft:     'background:#f3f4f6;color:#374151',
  pending:   'background:#fef3c7;color:#92400e',
  approved:  'background:#d1fae5;color:#065f46',
  rejected:  'background:#fee2e2;color:#991b1b',
  cancelled: 'background:#e5e7eb;color:#6b7280',
};
const _FOUNDER_MODE_LABELS = { at_issuance: 'At issuance', retroactive: 'Retroactive' };
// apply_founder_discount_retroactive refuses DRAFT and CANCELLED invoices.
const _FOUNDER_APPLIABLE_INVOICE_STATUSES = ['issued', 'partially_paid', 'paid', 'overdue'];

let _founderTab = 'grants';            // 'grants' | 'inbox'
let _founderGrants = [];
let _founderInbox = [];
let _founderInboxCount = null;
const _FOUNDER_EMPTY_FILTER = { status: '', academic_year_id: '', student_id: '', fee_item_id: '', search: '' };
let _founderFilter = { ..._FOUNDER_EMPTY_FILTER };
let _founderFormGrant = null;          // grant being edited; null on create
let _founderApply = null;              // { grant, invoices, selectedId }
// Sequence guards: a response that lands after a later tab switch, filter
// change, modal reopen or drawer reopen is dropped.
let _founderListSeq = 0;
let _founderInboxCountSeq = 0;
let _founderApplySeq = 0;
let _founderHistorySeq = 0;
let _founderOpenSeq = 0;               // statement-link resolution (_founderOpenFromHash)
let _founderRenew = null;              // { grant } while the Renew modal is open
let _founderPreviewSeq = 0;
let _founderPreviewCache = { key: null, matches: null };

// ── Small helpers ────────────────────────────────────────────────────────
function _founderStatusBadge(g) {
  const s = g.status || '';
  const style = _FOUNDER_STATUS_STYLES[s] || _FOUNDER_STATUS_STYLES.draft;
  const label = s ? s[0].toUpperCase() + s.slice(1) : '—';
  const tip = s === 'rejected' && g.rejection_reason ? ` title="${_finEsc(g.rejection_reason)}"` : '';
  return `<span${tip} style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:0.78rem;font-weight:600;${style}">${_finEsc(label)}</span>`
    + (g.is_active === false && s !== 'cancelled' ? ' <span style="font-size:0.72rem;color:#888;">(inactive)</span>' : '');
}
function _founderDiscountLabel(g) {
  if (g.discount_amount != null) return _pvMoney(g.discount_amount);
  if (g.discount_percent != null) return `${parseFloat(g.discount_percent)}%`;
  return '—';
}
function _founderYearName(id) {
  const y = (_rcvAcademicYearsCache || []).find(x => String(x.id) === String(id));
  return y ? (y.title || y.name || `#${id}`) : (id ? `#${id}` : '—');
}
function _founderYearOptions(selectedId) {
  return [...(_rcvAcademicYearsCache || [])]
    .sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')))
    .map(y => `<option value="${y.id}" ${String(y.id) === String(selectedId) ? 'selected' : ''}>${_finEsc(y.title || y.name || `#${y.id}`)}${y.is_current ? ' (current)' : ''}</option>`)
    .join('');
}
function _founderIsCreator(g) {
  return !!(currentUser && g.created_by != null && String(currentUser.id) === String(g.created_by));
}
// There is no finance-scoped staff lookup (every finance screen shows
// "Staff #N"), so only the signed-in user gets a name.
function _founderStaffLabel(id) {
  if (id == null) return '—';
  if (currentUser && String(currentUser.id) === String(id)) return 'You';
  return `Staff #${id}`;
}
function _founderGrantById(id) {
  return [..._founderGrants, ..._founderInbox].find(g => String(g.id) === String(id)) || null;
}
// Mirrors _proxy_kes_value in app/services/fin_founder_discount.py: a flat grant
// is its own amount; a percent grant is the fee item's default_amount × percent.
// null when a percent grant has no fee item (or default) to size it against.
function _founderProxyKes({ amount, percent, feeItemId }) {
  if (amount != null) return amount;
  if (percent == null) return 0;
  const f = (_rcvFeeItemsCache || []).find(x => String(x.id) === String(feeItemId));
  const base = f ? parseFloat(f.default_amount) : NaN;
  return isNaN(base) ? null : Math.round(base * percent) / 100;
}
// Fetched on each page load until it succeeds. A BE without the route answers
// 422 (it falls through to /{grant_id}); that, a 403 or a network failure keeps
// the defaults rather than blocking the page.
async function _founderLoadConfig() {
  if (_founderConfig?.fromServer) return _founderConfig;
  const res = await apiFetch(`${_FOUNDER_API}/config`);
  const body = res && res.ok ? await res.json().catch(() => null) : null;
  const threshold = parseFloat(body?.approval_threshold);
  _founderConfig = isNaN(threshold)
    ? { ..._FOUNDER_DEFAULT_CONFIG }
    : { threshold, currency: body.currency || 'KES', fromServer: true };
  return _founderConfig;
}
// Draft and pending grants are editable on any BE. An approved grant takes
// amount, percent and notes edits only where the BE re-runs the threshold check.
function _founderCanEdit(g) {
  if (!g.is_active) return false;
  if (g.status === 'draft' || g.status === 'pending') return true;
  return g.status === 'approved' && !!_founderConfig?.fromServer;
}
function _founderInfoBox(html, tone = 'navy') {
  const tones = {
    navy: 'background:var(--navy-50,#EEF3FA);border-left:3px solid var(--navy-400,#4A6FA5);color:var(--navy-900,#0D2137);',
    gold: 'background:var(--gold-100,#F7EFD5);border-left:3px solid var(--gold-500,#C9A227);color:#6b5400;',
  };
  return `<div style="${tones[tone]}border-radius:6px;padding:10px 14px;margin:10px 0;font-size:0.84rem;line-height:1.5;">${html}</div>`;
}

// ── Page ─────────────────────────────────────────────────────────────────
async function loadFounderDiscountsView(container) {
  container.innerHTML = `<div class="fin-page"><p style="color:#888;padding:20px 0;">Loading&#8230;</p></div>`;
  await Promise.all([_rcvLoadLookups({ items: true, students: true, academicYears: true }), _founderLoadConfig()]);
  // A statement link opens one grant, so it starts from the unfiltered list.
  if (window._founderOpenGrantId || window._founderOpenApplicationId) {
    _founderFilter = { ..._FOUNDER_EMPTY_FILTER };
    _founderTab = 'grants';
  }
  if (_founderTab === 'inbox' && !canView('finance.cancellations')) _founderTab = 'grants';
  container.innerHTML = `
    <div class="fin-page">
      <div class="fin-header-row">
        <h2 class="fin-title">Founder's Discounts</h2>
        <div class="fin-breadcrumb">Dashboard &rsaquo; Finance &rsaquo; Set-up &rsaquo; Founder's Discounts</div>
      </div>
      ${_founderInfoBox("A grant takes a flat amount or a percentage off one fee item, for one student, for one academic year, on top of any sibling discount. Once approved, every invoice generated for that student picks it up. Use <strong>Apply to Invoice</strong> only for invoices issued before the grant was approved.")}
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0;">
        <div id="founder-tabs" style="display:flex;gap:6px;">${_founderTabsHtml()}</div>
        <span style="flex:1;"></span>
        ${canAdd('finance.setup') ? `<button class="fin-btn-teal" onclick="_founderOpenForm()">New Grant</button>` : ''}
      </div>
      <div id="founder-tab-body"></div>
    </div>`;
  _founderRefreshInboxCount();
  await _founderRenderTab();
  await _founderOpenFromHash();
}

// Statement doc_ref clickthrough, via dashboard.js _DOC_ROUTE_TO_PRESELECT.
// Deployed BE (checked 2026-09-14) emits #fin-founder-discounts?open=
// {application_id}; its working tree (§Q.13, uncommitted that day) moves to
// #finance-founder-discounts?open={grant_id}. Both arrive here as one-shot
// vars. An application has no GET of its own, so it is resolved by walking the
// listed grants' /applications. The sequence guard drops the walk when the
// user navigates away or the page reloads.
async function _founderOpenFromHash() {
  const grantId = window._founderOpenGrantId;
  const appId = window._founderOpenApplicationId;
  window._founderOpenGrantId = null;
  window._founderOpenApplicationId = null;
  if (!grantId && !appId) return;
  const seq = ++_founderOpenSeq;
  const stale = () => seq !== _founderOpenSeq || !document.getElementById('founder-tab-body');
  if (grantId) {
    let g = _founderGrantById(grantId);
    if (!g) {
      const res = await apiFetch(`${_FOUNDER_API}/${parseInt(grantId, 10)}`);
      g = res && res.ok ? await res.json().catch(() => null) : null;
    }
    if (stale()) return;
    if (g) await _founderOpenHistory(g.id, g);
    else showToast(`Founder's discount grant #${grantId} was not found.`, 'error');
    return;
  }
  for (const g of _founderGrants) {
    const res = await apiFetch(`${_FOUNDER_API}/${g.id}/applications`);
    const apps = res && res.ok ? _toArray(await res.json().catch(() => [])) : [];
    if (stale()) return;
    if (apps.some(a => String(a.id) === String(appId))) { await _founderOpenHistory(g.id, g); return; }
  }
  showToast(`Couldn't find the grant behind founder's discount application #${appId}.`, 'error');
}

// .fin-btn-outline sets its colours with !important, so the pressed tab
// overrides inline at the same priority (same as _faViewToggleHtml).
function _founderTabsHtml() {
  const pressed = 'background:var(--navy-700,#1B3057)!important;color:#fff!important;border-color:var(--navy-700,#1B3057)!important;';
  const tab = (key, label) => `<button type="button" class="fin-btn-outline" aria-pressed="${_founderTab === key}" onclick="_founderSetTab('${key}')" style="padding:5px 14px;font-size:0.85rem;${_founderTab === key ? pressed : ''}">${label}</button>`;
  const count = _founderInboxCount
    ? ` <span style="display:inline-block;min-width:18px;padding:0 6px;border-radius:9px;background:var(--gold-500,#C9A227);color:#fff;font-size:0.72rem;line-height:18px;text-align:center;">${_founderInboxCount}</span>`
    : '';
  return tab('grants', 'Grants') + (canView('finance.cancellations') ? tab('inbox', `Approvals Inbox${count}`) : '');
}
function _founderSetTab(key) {
  if (_founderTab === key) return;
  _founderTab = key;
  const tabs = document.getElementById('founder-tabs');
  if (tabs) tabs.innerHTML = _founderTabsHtml();
  _founderRenderTab();
}
async function _founderRenderTab() {
  const body = document.getElementById('founder-tab-body');
  if (!body) return;
  if (_founderTab === 'inbox') return _founderLoadInbox(body);
  // .fin-form-select is width:100% !important, so each filter sits in a sized box.
  body.innerHTML = `
    <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px;">
      <div style="width:170px;">
        <label class="fin-form-label">Status</label>
        <select id="founder-f-status" class="fin-form-select" onchange="_founderFilterChanged()">
          <option value="">All statuses</option>
          ${Object.keys(_FOUNDER_STATUS_STYLES).map(s => `<option value="${s}" ${_founderFilter.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div style="width:210px;">
        <label class="fin-form-label">Academic Year</label>
        <select id="founder-f-year" class="fin-form-select" onchange="_founderFilterChanged()">
          <option value="">All years</option>${_founderYearOptions(_founderFilter.academic_year_id)}
        </select>
      </div>
      <div style="width:220px;">
        <label class="fin-form-label">Student</label>
        <select id="founder-f-student" class="fin-form-select" onchange="_founderFilterChanged()">${_rcvStudentOptions('All students', _founderFilter.student_id)}</select>
      </div>
      <div style="width:190px;">
        <label class="fin-form-label">Fee Item</label>
        <select id="founder-f-fee-item" class="fin-form-select" onchange="_founderFilterChanged()">
          <option value="">All fee items</option>
          ${(_rcvFeeItemsCache || []).map(f => `<option value="${f.id}" ${String(f.id) === String(_founderFilter.fee_item_id) ? 'selected' : ''}>${_finEsc(f.name || `#${f.id}`)}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;min-width:200px;">
        <label class="fin-form-label">Search</label>
        <input id="founder-f-search" class="fin-form-input" placeholder="Student or fee item" value="${_finEsc(_founderFilter.search)}"
          oninput="_founderFilter.search=this.value;_founderRenderGrantsTable()">
      </div>
      <span id="founder-count" style="font-size:0.82rem;color:var(--grey-600,#666);padding-bottom:10px;"></span>
    </div>
    <div id="founder-table"></div>`;
  await _founderLoadGrants();
}

// ── Grants tab ───────────────────────────────────────────────────────────
// Status and year filter on the server; the search box filters what came back.
async function _founderLoadGrants() {
  const seq = ++_founderListSeq;
  const el = document.getElementById('founder-table');
  if (!el) return;
  el.innerHTML = `<p style="color:#888;padding:12px 0;">Loading grants&#8230;</p>`;
  const qs = new URLSearchParams();
  if (_founderFilter.status) qs.set('status', _founderFilter.status);
  if (_founderFilter.academic_year_id) qs.set('academic_year_id', _founderFilter.academic_year_id);
  if (_founderFilter.student_id) qs.set('student_id', _founderFilter.student_id);
  if (_founderFilter.fee_item_id) qs.set('fee_item_id', _founderFilter.fee_item_id);
  const res = await apiFetch(`${_FOUNDER_API}${qs.toString() ? `?${qs}` : ''}`);
  if (seq !== _founderListSeq || !el.isConnected) return;
  if (!res || !res.ok) {
    const msg = res ? await parseApiError(res) : 'Could not reach the server.';
    if (seq !== _founderListSeq || !el.isConnected) return;
    el.innerHTML = `<p style="color:var(--coral-600);padding:12px 0;">Could not load grants${res ? ` (HTTP ${res.status})` : ''}: ${_finEsc(msg)}</p>`;
    return;
  }
  const rows = _toArray(await res.json().catch(() => []));
  if (seq !== _founderListSeq || !el.isConnected) return;
  _founderGrants = rows;
  _founderRenderGrantsTable();
}
function _founderFilterChanged() {
  _founderFilter.status = document.getElementById('founder-f-status')?.value || '';
  _founderFilter.academic_year_id = document.getElementById('founder-f-year')?.value || '';
  _founderFilter.student_id = document.getElementById('founder-f-student')?.value || '';
  _founderFilter.fee_item_id = document.getElementById('founder-f-fee-item')?.value || '';
  _founderLoadGrants();
}
function _founderRenderGrantsTable() {
  const el = document.getElementById('founder-table');
  if (!el) return;
  const term = (_founderFilter.search || '').trim().toLowerCase();
  const rows = _founderGrants.filter(g => !term
    || _rcvStudentName(g.student_id).toLowerCase().includes(term)
    || _rcvFeeItemName(g.fee_item_id).toLowerCase().includes(term));
  const countEl = document.getElementById('founder-count');
  if (countEl) countEl.textContent = `${rows.length} grant${rows.length === 1 ? '' : 's'}`;
  if (!rows.length) {
    const empty = _founderGrants.length ? 'No grants match the search.' : "No founder's discount grants yet.";
    el.innerHTML = `<div class="fin-table-wrap"><table class="fin-table"><tbody><tr><td class="fin-empty">${empty}</td></tr></tbody></table></div>`;
    return;
  }
  el.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>STUDENT</th><th>FEE ITEM</th><th>ACADEMIC YEAR</th><th>DISCOUNT</th><th>STATUS</th><th>CREATED BY</th><th></th></tr></thead>
    <tbody>${rows.map(g => `<tr>
      <td>${_finEsc(_rcvStudentName(g.student_id))}</td>
      <td>${_finEsc(_rcvFeeItemName(g.fee_item_id))}</td>
      <td>${_finEsc(_founderYearName(g.academic_year_id))}</td>
      <td>${_founderDiscountLabel(g)}</td>
      <td>${_founderStatusBadge(g)}</td>
      <td>${_finEsc(_founderStaffLabel(g.created_by))}<br><small style="color:#888;">${_pvDate(g.created_at)}</small></td>
      <td style="white-space:nowrap;text-align:right;">${_founderRowActions(g)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function _founderRowActions(g) {
  const btn = (label, fn, cls = 'fin-btn-outline') => `<button class="${cls}" style="padding:3px 10px;font-size:0.78rem;margin:2px;" onclick="${fn}">${label}</button>`;
  const open = g.status === 'draft' || g.status === 'pending';
  const out = [];
  if (open && canAdd('finance.cancellations')) {
    out.push(_founderIsCreator(g)
      ? `<span style="font-size:0.75rem;color:#888;margin:2px 6px;" title="The server refuses approval by the grant's creator.">Needs another approver</span>`
      : btn('Approve', `_founderApprove(${g.id})`, 'fin-btn-teal') + btn('Reject', `_founderOpenReject(${g.id})`));
  }
  if (g.status === 'approved' && g.is_active && canAdd('finance.cancellations')) out.push(btn('Apply to Invoice', `_founderOpenApply(${g.id})`, 'fin-btn-teal'));
  if (_founderCanEdit(g) && canEdit('finance.setup')) out.push(btn('Edit', `_founderOpenForm(${g.id})`));
  if (canView('finance.setup') || canView('finance.cancellations')) out.push(btn('History', `_founderOpenHistory(${g.id})`));
  if (g.is_active && (open || g.status === 'approved') && canDelete('finance.setup')) out.push(btn('Cancel', `_founderCancel(${g.id})`));
  return out.join('');
}

// ── Approvals Inbox tab ──────────────────────────────────────────────────
async function _founderLoadInbox(body) {
  const seq = ++_founderListSeq;
  body.innerHTML = `<p style="color:#888;padding:12px 0;">Loading approvals&#8230;</p>`;
  const res = await apiFetch(`${_FOUNDER_API}/pending-approval`);
  if (seq !== _founderListSeq || !body.isConnected) return;
  if (!res || !res.ok) {
    const msg = res ? await parseApiError(res) : 'Could not reach the server.';
    if (seq !== _founderListSeq || !body.isConnected) return;
    body.innerHTML = `<p style="color:var(--coral-600);padding:12px 0;">Could not load the approvals inbox${res ? ` (HTTP ${res.status})` : ''}: ${_finEsc(msg)}</p>`;
    return;
  }
  const rows = _toArray(await res.json().catch(() => []));
  if (seq !== _founderListSeq || !body.isConnected) return;
  _founderInbox = rows;
  _founderSetInboxCount(rows.length);
  if (!rows.length) {
    body.innerHTML = `<div class="fin-table-wrap"><table class="fin-table"><tbody><tr><td class="fin-empty">Nothing waiting for approval.</td></tr></tbody></table></div>`;
    return;
  }
  body.innerHTML = `
    <p style="font-size:0.84rem;color:var(--grey-600,#666);margin:0 0 10px;">Grants above the approval threshold. Each needs approval from someone other than the person who created it.</p>
    <div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>STUDENT</th><th>FEE ITEM</th><th>ACADEMIC YEAR</th><th>DISCOUNT</th><th>REASON</th><th>CREATED BY</th><th></th></tr></thead>
    <tbody>${rows.map(g => `<tr>
      <td>${_finEsc(_rcvStudentName(g.student_id))}</td>
      <td>${_finEsc(_rcvFeeItemName(g.fee_item_id))}</td>
      <td>${_finEsc(_founderYearName(g.academic_year_id))}</td>
      <td>${_founderDiscountLabel(g)}</td>
      <td style="max-width:260px;">${_finEsc(g.reason || '')}</td>
      <td>${_finEsc(_founderStaffLabel(g.created_by))}<br><small style="color:#888;">${_pvDate(g.created_at)}</small></td>
      <td style="white-space:nowrap;text-align:right;">${_founderRowActions(g)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}
// The tab badge is fed by its own request so it is right on the Grants tab too.
// A 403 (no finance.cancellations view) just leaves the badge off.
async function _founderRefreshInboxCount() {
  if (!canView('finance.cancellations')) return;
  const seq = ++_founderInboxCountSeq;
  const res = await apiFetch(`${_FOUNDER_API}/pending-approval`);
  if (seq !== _founderInboxCountSeq || !res || !res.ok) return;
  const rows = _toArray(await res.json().catch(() => []));
  if (seq !== _founderInboxCountSeq) return;
  _founderSetInboxCount(rows.length);
}
function _founderSetInboxCount(n) {
  _founderInboxCount = n;
  const tabs = document.getElementById('founder-tabs');
  if (tabs) tabs.innerHTML = _founderTabsHtml();
}
async function _founderAfterChange() {
  _founderRefreshInboxCount();
  await _founderRenderTab();
}

// ── Approve / Reject / Cancel ────────────────────────────────────────────
async function _founderApprove(id) {
  const res = await apiFetch(`${_FOUNDER_API}/${id}/approve`, { method: 'POST' });
  if (!res) return;
  if (res.ok) {
    showToast('Grant approved. Invoices generated from now on pick it up.', 'success');
    await _founderAfterChange();
    return;
  }
  // A 403 is as likely the segregation-of-duties refusal as a missing
  // permission; the server's detail says which.
  showToast(await parseApiError(res), 'error');
}

function _founderOpenReject(id) {
  const g = _founderGrantById(id);
  const wrap = document.createElement('div');
  wrap.id = 'founder-reject-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:460px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 6px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Reject Grant</h3>
      ${g ? `<p style="margin:0 0 12px;font-size:0.85rem;color:var(--grey-600,#666);">${_finEsc(_rcvStudentName(g.student_id))} &middot; ${_finEsc(_rcvFeeItemName(g.fee_item_id))} &middot; ${_founderDiscountLabel(g)}</p>` : ''}
      <label class="fin-form-label">Reason <span class="fin-required">*</span></label>
      <textarea id="founder-reject-reason" class="fin-form-textarea" rows="3" maxlength="500"
        oninput="document.getElementById('founder-reject-count').textContent=this.value.length"></textarea>
      <div style="display:flex;justify-content:space-between;">
        <span class="fin-field-error" id="founder-reject-err"></span>
        <span style="font-size:0.75rem;color:#888;"><span id="founder-reject-count">0</span>/500</span>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('founder-reject-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" id="founder-reject-submit" style="background:var(--coral-500,#D94040);" onclick="_founderSubmitReject(${parseInt(id, 10)})">Reject</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById('founder-reject-reason').focus();
}
async function _founderSubmitReject(id) {
  const reason = document.getElementById('founder-reject-reason').value.trim();
  const errEl = document.getElementById('founder-reject-err');
  errEl.textContent = '';
  if (reason.length < 3) { errEl.textContent = 'Give a reason of at least 3 characters.'; return; }
  const btn = document.getElementById('founder-reject-submit');
  btn.disabled = true;
  const res = await apiFetch(`${_FOUNDER_API}/${id}/reject`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
  });
  btn.disabled = false;
  if (!res) return;
  if (res.ok) {
    _coaCloseModal('founder-reject-modal-overlay');
    showToast('Grant rejected.', 'success');
    await _founderAfterChange();
    return;
  }
  errEl.textContent = await parseApiError(res);
}

async function _founderCancel(id) {
  const g = _founderGrantById(id);
  const who = g ? ` for ${_rcvStudentName(g.student_id)} (${_rcvFeeItemName(g.fee_item_id)})` : '';
  if (!confirm(`Cancel this grant${who}? New invoices stop picking it up. Discounts already on invoices are not reversed.`)) return;
  const res = await apiFetch(`${_FOUNDER_API}/${id}`, { method: 'DELETE' });
  if (!res) return;
  if (res.ok) {
    showToast('Grant cancelled.', 'success');
    await _founderAfterChange();
    return;
  }
  showToast(await parseApiError(res), 'error');
}

// ── Create / Edit form ───────────────────────────────────────────────────
// Student, fee item and year are fixed once saved (FounderDiscountUpdate has no
// such fields). An approved grant also keeps its reason: the BE refuses any
// field on it but amount, percent, notes and is_active (see _founderCanEdit).
function _founderOpenForm(id = null) {
  const g = id != null ? _founderGrantById(id) : null;
  if (id != null && !g) return;
  _founderFormGrant = g;
  const isPct = g ? g.discount_percent != null : false;
  const value = g ? parseFloat(isPct ? g.discount_percent : g.discount_amount) : '';
  const currentYear = (_rcvAcademicYearsCache || []).find(y => y.is_current);
  const radio = (key, label) => `<label style="display:inline-flex;align-items:center;white-space:nowrap;font-size:0.9rem;cursor:pointer;">
      <input type="radio" name="founder-form-kind" value="${key}" style="width:auto;max-width:none;margin:0 6px 0 0;padding:0;accent-color:var(--navy-700);"
        ${(key === 'percent') === isPct ? 'checked' : ''} onchange="_founderFormRecompute()">${label}</label>`;
  const feeItems = (_rcvFeeItemsCache || []).filter(f => f.is_active !== false || String(f.id) === String(g?.fee_item_id));
  const wrap = document.createElement('div');
  wrap.id = 'founder-form-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;overflow:auto;padding:24px;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:580px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 14px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">${g ? 'Edit Grant' : "New Founder's Discount"}</h3>
      <div class="fin-form-group">
        <label class="fin-form-label">Student <span class="fin-required">*</span></label>
        <select id="founder-form-student" class="fin-form-select" ${g ? 'disabled' : ''} onchange="_founderRefreshPreview()">${_rcvStudentOptions('Please Select', g?.student_id)}</select>
        <span class="fin-field-error" id="founder-form-student-err"></span>
      </div>
      <div class="fin-form-grid-2">
        <div class="fin-form-group">
          <label class="fin-form-label">Fee Item <span class="fin-required">*</span></label>
          <select id="founder-form-fee-item" class="fin-form-select" ${g ? 'disabled' : ''} onchange="_founderFormRecompute();_founderRefreshPreview()">
            <option value="">${_finEsc(lookupPlaceholder('fee-items', 'Please Select'))}</option>
            ${feeItems.map(f => `<option value="${f.id}" ${String(f.id) === String(g?.fee_item_id) ? 'selected' : ''}>${_finEsc(f.name || `#${f.id}`)} (${_pvMoney(f.default_amount)})</option>`).join('')}
          </select>
          <span class="fin-field-error" id="founder-form-fee-item-err"></span>
        </div>
        <div class="fin-form-group">
          <label class="fin-form-label">Academic Year <span class="fin-required">*</span></label>
          <select id="founder-form-year" class="fin-form-select" ${g ? 'disabled' : ''} onchange="_founderRefreshPreview()">
            <option value="">${_finEsc(lookupPlaceholder('academic-years', 'Please Select'))}</option>
            ${_founderYearOptions(g ? g.academic_year_id : currentYear?.id)}
          </select>
          <span class="fin-field-error" id="founder-form-year-err"></span>
        </div>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Discount <span class="fin-required">*</span></label>
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:6px;">${radio('amount', 'Flat amount (KES)')}${radio('percent', 'Percent of the fee line')}</div>
        <input type="number" id="founder-form-value" class="fin-form-input" min="0" step="0.01" value="${value}" oninput="_founderFormRecompute()">
        <span id="founder-form-value-hint" style="font-size:12px;color:var(--grey-600);"></span>
        <span class="fin-field-error" id="founder-form-value-err"></span>
      </div>
      <div id="founder-form-preview" style="margin-top:8px;"></div>
      <div id="founder-threshold-banner"></div>
      <div class="fin-form-group">
        <label class="fin-form-label">Reason <span class="fin-required">*</span></label>
        <textarea id="founder-form-reason" class="fin-form-textarea" rows="2" maxlength="500" oninput="_founderFormRecompute()" ${g?.status === 'approved' ? 'disabled title="An approved grant keeps its reason."' : ''}>${_finEsc(g?.reason || '')}</textarea>
        <div style="display:flex;justify-content:space-between;">
          <span class="fin-field-error" id="founder-form-reason-err"></span>
          <span style="font-size:0.75rem;color:#888;"><span id="founder-form-reason-count">0</span>/500</span>
        </div>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Notes</label>
        <textarea id="founder-form-notes" class="fin-form-textarea" rows="2" maxlength="1000" oninput="_founderFormRecompute()">${_finEsc(g?.notes || '')}</textarea>
        <div style="text-align:right;font-size:0.75rem;color:#888;"><span id="founder-form-notes-count">0</span>/1000</div>
      </div>
      <div id="founder-form-msg"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('founder-form-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" id="founder-form-submit" onclick="_founderSubmitForm()">${g ? 'Save Changes' : 'Save Grant'}</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  _founderPreviewCache = { key: null, matches: null };
  _founderFormRecompute();
  // Prefill preview on edit (student + fee_item + year already set) — on
  // create the student is blank so the fetch bails and the container
  // stays empty until the bursar picks one.
  _founderRefreshPreview();
}


// ── Preview: resolve what schedule + amount the grant will land on ──────
// The picker exposes FeeItem (semantic anchor). Bursars think in
// FeeSchedule (Willow-Tuition-50k vs Oak-Tuition-60k). A preview strip
// under the picker lets them see the actual schedule + amount for THIS
// student BEFORE they save, so the picker label doesn't mislead when
// two students share a fee item but sit on different schedules.

async function _founderRefreshPreview() {
  const previewEl = document.getElementById('founder-form-preview');
  if (!previewEl) return;
  const studentId = parseInt(document.getElementById('founder-form-student').value, 10);
  const feeItemId = parseInt(document.getElementById('founder-form-fee-item').value, 10);
  const yearId    = parseInt(document.getElementById('founder-form-year').value, 10);
  if (!studentId || !feeItemId) {
    previewEl.innerHTML = '';
    _founderPreviewCache = { key: null, matches: null };
    return;
  }
  const key = `${studentId}|${feeItemId}|${yearId || ''}`;
  // Cache-hit: no fetch, just re-render (value/percent change triggers
  // this same helper to refresh the KES estimate on cached matches).
  if (_founderPreviewCache.key === key && _founderPreviewCache.matches !== null) {
    _founderRenderPreview();
    return;
  }
  const seq = ++_founderPreviewSeq;
  previewEl.innerHTML = `<div style="font-size:0.8rem;color:#888;padding:4px 0;">Checking this student's current billing…</div>`;
  const qs = new URLSearchParams({ student_id: studentId, fee_item_id: feeItemId });
  if (yearId) qs.set('academic_year_id', yearId);
  let res;
  try {
    res = await apiFetch(`${_FOUNDER_API}/preview?${qs.toString()}`);
  } catch (_) {
    if (seq === _founderPreviewSeq) previewEl.innerHTML = '';
    return;
  }
  if (seq !== _founderPreviewSeq) return;
  if (!res || !res.ok) {
    // Silent — the picker still works, the preview is a nice-to-have.
    previewEl.innerHTML = '';
    return;
  }
  const body = await res.json().catch(() => null);
  if (seq !== _founderPreviewSeq) return;
  _founderPreviewCache = { key, matches: (body && Array.isArray(body.matches)) ? body.matches : [] };
  _founderRenderPreview();
}

function _founderRenderPreview() {
  const previewEl = document.getElementById('founder-form-preview');
  if (!previewEl) return;
  const matches = _founderPreviewCache.matches;
  if (matches == null) { previewEl.innerHTML = ''; return; }
  const feeItemId = parseInt(document.getElementById('founder-form-fee-item').value, 10);
  const feeItemName = _rcvFeeItemName(feeItemId) || 'this fee item';
  const yearVal = document.getElementById('founder-form-year').value;

  if (matches.length === 0) {
    previewEl.innerHTML = _founderInfoBox(
      `This student has no active <strong>${_finEsc(feeItemName)}</strong> assignment${yearVal ? ' for the selected year' : ''}. The grant is still saveable — it will apply to any future invoice that bills this fee item for this student.`,
      'gold'
    );
    return;
  }

  const isPct = document.querySelector('input[name="founder-form-kind"]:checked')?.value === 'percent';
  const raw = parseFloat(document.getElementById('founder-form-value').value);
  const rows = matches.map(m => {
    const amt = parseFloat(m.amount || 0);
    let est = '';
    if (!isNaN(raw) && raw > 0) {
      const perLine = isPct ? amt * raw / 100 : Math.min(raw, amt);
      est = ` &middot; grant would apply <strong>${_pvMoney(perLine)}</strong>`;
    }
    const term = m.term_title ? ` &middot; ${_finEsc(m.term_title)}` : '';
    return `<li style="margin:2px 0;">${_finEsc(m.scope_label || 'Schedule')}${term} &middot; <strong>${_pvMoney(amt)}</strong>${est}</li>`;
  }).join('');
  const noun = matches.length === 1 ? 'schedule' : `${matches.length} schedules`;
  previewEl.innerHTML = _founderInfoBox(
    `Current billing for this student on <strong>${_finEsc(feeItemName)}</strong> (${noun}):<ul style="margin:6px 0 0 20px;padding:0;">${rows}</ul>`,
    'navy'
  );
}


function _founderFormRecompute() {
  const banner = document.getElementById('founder-threshold-banner');
  if (!banner) return;
  const isPct = document.querySelector('input[name="founder-form-kind"]:checked')?.value === 'percent';
  const raw = parseFloat(document.getElementById('founder-form-value').value);
  const feeItemId = document.getElementById('founder-form-fee-item').value;
  document.getElementById('founder-form-value-hint').textContent = isPct
    ? 'Percent of the fee line: above 0, at most 100.'
    : 'KES taken off the fee line: above 0.';
  document.getElementById('founder-form-reason-count').textContent = document.getElementById('founder-form-reason').value.length;
  document.getElementById('founder-form-notes-count').textContent = document.getElementById('founder-form-notes').value.length;
  // Value/percent changes: re-render the KES estimate against the cached
  // matches without a re-fetch (cache-hit inside _founderRefreshPreview).
  _founderRefreshPreview();

  const cfg = _founderConfig || _FOUNDER_DEFAULT_CONFIG;
  const money = v => cfg.currency === 'KES' ? _pvMoney(v) : `${_finEsc(cfg.currency)} ${_finFmt(v)}`;
  const g = _founderFormGrant;
  if (g && !cfg.fromServer) {
    // Older BE: update_founder_discount doesn't re-run the threshold check, so
    // an edit never moves a grant between Draft and Pending.
    banner.innerHTML = _founderInfoBox(`Saving keeps this grant <strong>${_finEsc(g.status)}</strong>. The approval threshold is only checked when a grant is created; for a different threshold outcome, cancel this grant and create a new one.`);
    return;
  }
  if (isNaN(raw) || raw <= 0) { banner.innerHTML = ''; return; }
  const proxy = _founderProxyKes({ amount: isPct ? null : raw, percent: isPct ? raw : null, feeItemId });
  if (proxy == null) {
    banner.innerHTML = _founderInfoBox("Pick the fee item to see whether this grant needs a second approver — a percent grant is sized against the fee item's default amount.");
    return;
  }
  const threshold = money(cfg.threshold);
  const sized = isPct ? ` (about ${money(proxy)} on the fee item's default amount)` : '';
  if (proxy > cfg.threshold) {
    const lands = !g ? 'it is saved as <strong>Pending</strong>'
      : g.status === 'pending' ? 'it stays <strong>Pending</strong>'
      : 'saving sends it back to <strong>Pending</strong>';
    banner.innerHTML = _founderInfoBox(`<strong>This grant needs a second approver.</strong> ${g ? 'With this amount it' : 'It'} is above the ${threshold} approval threshold${sized}, so ${lands} and waits in the Approvals Inbox for someone other than you.`, 'gold');
    return;
  }
  if (!cfg.fromServer) {
    banner.innerHTML = _founderInfoBox(`At or below the ${threshold} approval threshold${sized}, so it is saved as a <strong>Draft</strong>. It still has to be approved, by someone other than you, before invoices pick it up.`);
    return;
  }
  const lands = !g || g.status !== 'approved'
    ? 'saving approves it, with you as the approver of record'
    : 'it stays <strong>Approved</strong>';
  banner.innerHTML = _founderInfoBox(`At or below the ${threshold} approval threshold${sized}, so ${lands}. Invoices generated from then on pick it up; no second approver is needed.`);
}

// Toast for a saved grant, read from the status the server returned (§Q.2/Q.3).
// A create or renew that comes back APPROVED has already taken effect, so it
// says "Grant applied" rather than anything about awaiting approval. After an
// edit the status is re-read too: PATCH can move an approved grant to Pending
// and a pending one to Approved.
function _founderOutcomeText(saved, { edited = false, target = '' } = {}) {
  const status = saved?.status;
  const why = {
    pending: 'it is above the approval threshold and waits in the Approvals Inbox for someone other than you.',
    approved: 'it is at or below the approval threshold, so invoices generated from now on pick it up.',
    draft: 'someone other than you has to approve it before invoices pick it up.',
  }[status];
  const label = status ? status[0].toUpperCase() + status.slice(1) : '';
  if (!label) return edited ? 'Grant updated.' : 'Grant saved.';
  if (edited) return `Grant updated. It is now ${label}${why ? `: ${why}` : '.'}`;
  if (status === 'approved') return `Grant applied${target}: ${why}`;
  return `Grant saved${target} as ${label}${why ? `: ${why}` : '.'}`;
}

async function _founderSubmitForm() {
  const g = _founderFormGrant;
  const msgEl = document.getElementById('founder-form-msg');
  msgEl.innerHTML = '';
  ['student', 'fee-item', 'year', 'value', 'reason'].forEach(k => { document.getElementById(`founder-form-${k}-err`).textContent = ''; });
  let ok = true;
  const err = (k, text) => { document.getElementById(`founder-form-${k}-err`).textContent = text; ok = false; };

  const studentId = parseInt(document.getElementById('founder-form-student').value, 10);
  const feeItemId = parseInt(document.getElementById('founder-form-fee-item').value, 10);
  const yearId = parseInt(document.getElementById('founder-form-year').value, 10);
  const isPct = document.querySelector('input[name="founder-form-kind"]:checked')?.value === 'percent';
  const num = parseFloat(document.getElementById('founder-form-value').value);
  const reason = document.getElementById('founder-form-reason').value.trim();
  const notes = document.getElementById('founder-form-notes').value.trim();
  if (!g) {
    if (!studentId) err('student', 'Pick a student.');
    if (!feeItemId) err('fee-item', 'Pick a fee item.');
    if (!yearId) err('year', 'Pick an academic year.');
  }
  if (isNaN(num) || num <= 0) err('value', isPct ? 'Enter a percent above 0.' : 'Enter an amount above 0.');
  else if (isPct && num > 100) err('value', 'A percent grant can be at most 100.');
  if (reason.length < 3) err('reason', 'Give a reason of at least 3 characters.');
  if (!ok) return;

  // Exactly one of the two is non-null; sending the other as null also clears
  // it on PATCH when an edit switches between amount and percent.
  const discount = isPct ? { discount_amount: null, discount_percent: num } : { discount_amount: num, discount_percent: null };
  // On edit the discount goes out only when it changed: the BE re-runs the
  // threshold check whenever discount_* is in the body, which would send an
  // approved above-threshold grant back to Pending over a notes edit. An
  // approved grant's reason is locked, so it isn't sent either.
  const amountChanged = !!g && (isPct !== (g.discount_percent != null) || num !== parseFloat(isPct ? g.discount_percent : g.discount_amount));
  const payload = g
    ? { ...(amountChanged ? discount : {}), ...(g.status === 'approved' ? {} : { reason }), notes: notes || null }
    : { student_id: studentId, fee_item_id: feeItemId, academic_year_id: yearId, ...discount, reason, ...(notes ? { notes } : {}) };
  const btn = document.getElementById('founder-form-submit');
  btn.disabled = true;
  const res = await apiFetch(g ? `${_FOUNDER_API}/${g.id}` : _FOUNDER_API, {
    method: g ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  btn.disabled = false;
  if (res && res.ok) {
    const saved = await res.json().catch(() => ({}));
    _coaCloseModal('founder-form-modal-overlay');
    showToast(_founderOutcomeText(saved, { edited: !!g }), 'success');
    await _founderAfterChange();
    return;
  }
  // 409 (an active grant already covers this student × fee item × year) and
  // 404 details name the conflict, so they are shown as sent.
  _pvShowCoralMsg(msgEl, res ? await parseApiError(res) : 'Network error. Nothing was saved.');
}

// ── Apply to Invoice ─────────────────────────────────────────────────────
// Lists the student's invoices that can take the grant: issued, partially
// paid, paid or overdue, with a positive line on the grant's fee item.
function _founderMatchingLines(inv, g) {
  return (inv.line_items || []).filter(li => String(li.fee_item_id) === String(g.fee_item_id) && parseFloat(li.amount) > 0);
}
// Same arithmetic as _compute_grant_amount: a flat grant is its amount, a
// percent grant is percent × the line's amount. The server does not cap a flat
// grant at the line, only at the invoice's outstanding balance.
function _founderEstimate(g, line) {
  if (g.discount_amount != null) return parseFloat(g.discount_amount);
  return Math.round(parseFloat(line?.amount || 0) * parseFloat(g.discount_percent || 0)) / 100;
}
// FeeInvoiceRead.amount_credited (applied credit notes + retroactive founder
// discounts) is in the BE working tree but not on live openapi.json (checked
// 2026-09-14). When the payload carries it, outstanding is amount_due −
// amount_paid − amount_credited. Without it this falls back to the applied-CN
// index, which misses earlier retroactive founder discounts. The server
// re-checks the real outstanding on submit either way.
function _founderInvoiceOutstanding(inv) {
  return inv.amount_credited != null ? invoiceBalance(inv) : invoiceBalance(inv, creditedForInvoice(inv.id));
}

async function _founderOpenApply(id) {
  const g = _founderGrantById(id);
  if (!g) return;
  document.getElementById('founder-apply-modal-overlay')?.remove();
  const seq = ++_founderApplySeq;
  _founderApply = {
    grant: g, invoices: [], selectedId: null,
    // Line ids where THIS grant is already applied (status='applied'). The
    // server refuses a re-apply with 409, so the modal disables those lines
    // and — when every matching line on an invoice is exhausted — disables
    // the whole invoice row.
    appliedLineItemIds: new Set(),
  };
  const wrap = document.createElement('div');
  wrap.id = 'founder-apply-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;overflow:auto;padding:24px;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:760px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 6px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Apply Grant to an Issued Invoice</h3>
      <p style="margin:0 0 10px;font-size:0.86rem;color:var(--grey-600,#666);">
        <strong>${_finEsc(_rcvStudentName(g.student_id))}</strong> &middot; ${_finEsc(_rcvFeeItemName(g.fee_item_id))} &middot; ${_finEsc(_founderYearName(g.academic_year_id))} &middot; <strong>${_founderDiscountLabel(g)}</strong>
      </p>
      ${_founderInfoBox("Posts a reversing entry (DR income, CR AR control) and reduces the invoice's balance; the invoice's amount due is not changed. A grant can be applied to each invoice line only once.")}
      <div id="founder-apply-list"><p style="color:#888;padding:10px 0;">Loading invoices&#8230;</p></div>
      <div id="founder-apply-line-wrap" class="fin-form-group" style="display:none;margin-top:12px;">
        <label class="fin-form-label">Invoice Line</label>
        <select id="founder-apply-line" class="fin-form-select" onchange="_founderApplyRecompute()"></select>
      </div>
      <div class="fin-form-group" style="margin-top:12px;max-width:260px;">
        <label class="fin-form-label">Override Amount (KES)</label>
        <input type="number" id="founder-apply-override" class="fin-form-input" min="0" step="0.01" placeholder="Use the grant's value" oninput="_founderApplyRecompute()">
      </div>
      <div id="founder-apply-preview"></div>
      <div id="founder-apply-msg"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('founder-apply-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" id="founder-apply-submit" disabled onclick="_founderSubmitApply()">Apply Discount</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const [res, appsRes] = await Promise.all([
    apiFetch(`${API_BASE}/receivables/fee-invoices?student_id=${parseInt(g.student_id, 10)}`),
    loadAppliedCreditIndex(true),
    apiFetch(`${API_BASE}/receivables/setup/founder-discounts/${parseInt(g.id, 10)}/applications`).then(r => {
      if (!r || !r.ok) return null;
      return r.json().catch(() => null);
    }).then(rows => {
      if (!Array.isArray(rows)) return;   // silent — worst case the modal reverts to server-side 409
      rows.forEach(a => {
        if (a && a.status === 'applied' && a.fee_invoice_line_item_id != null) {
          _founderApply.appliedLineItemIds.add(parseInt(a.fee_invoice_line_item_id, 10));
        }
      });
    }),
  ]);
  const listEl = document.getElementById('founder-apply-list');
  if (seq !== _founderApplySeq || !listEl) return;
  if (!res || !res.ok) {
    const msg = res ? await parseApiError(res) : 'Could not reach the server.';
    if (seq !== _founderApplySeq || !listEl.isConnected) return;
    listEl.innerHTML = `<p style="color:var(--coral-600);">Could not load this student's invoices: ${_finEsc(msg)}</p>`;
    return;
  }
  const all = _toArray(await res.json().catch(() => []));
  if (seq !== _founderApplySeq || !listEl.isConnected) return;
  _founderApply.invoices = all.filter(inv => _FOUNDER_APPLIABLE_INVOICE_STATUSES.includes(inv.status) && _founderMatchingLines(inv, g).length);
  _founderRenderApplyList();
}

function _founderRenderApplyList() {
  const ctx = _founderApply;
  const listEl = document.getElementById('founder-apply-list');
  if (!ctx || !listEl) return;
  const g = ctx.grant;
  if (!ctx.invoices.length) {
    listEl.innerHTML = `<p style="color:var(--grey-600,#666);font-size:0.88rem;padding:6px 0;">No issued invoice for ${_finEsc(_rcvStudentName(g.student_id))} has a ${_finEsc(_rcvFeeItemName(g.fee_item_id))} line. Invoices generated after this grant was approved already carry the discount.</p>`;
    return;
  }
  listEl.innerHTML = `<div class="fin-table-wrap" style="max-height:260px;overflow:auto;"><table class="fin-table">
    <thead><tr><th></th><th>INVOICE</th><th>STATUS</th><th>LINE AMOUNT</th><th>OUTSTANDING</th><th>DISCOUNT</th></tr></thead>
    <tbody>${ctx.invoices.map(inv => {
      const lines = _founderMatchingLines(inv, g);
      const outstanding = _founderInvoiceOutstanding(inv);
      const settled = outstanding <= 0.005;
      // A line is unavailable if this grant is already applied to it.
      // The whole invoice row goes dark once every matching line is taken.
      const availableLines = lines.filter(li => !ctx.appliedLineItemIds.has(parseInt(li.id, 10)));
      const allApplied = lines.length > 0 && availableLines.length === 0;
      const disableReason = settled
        ? 'Nothing outstanding on this invoice.'
        : allApplied
          ? "This grant is already applied to every matching line on this invoice."
          : null;
      const est = _founderEstimate(g, availableLines[0] || lines[0]);
      return `<tr${disableReason ? ' style="opacity:0.55;"' : ''}>
        <td><input type="radio" name="founder-apply-invoice" value="${inv.id}" style="width:auto;margin:0;accent-color:var(--navy-700);"
          ${disableReason ? `disabled title="${_finEsc(disableReason)}"` : ''} onchange="_founderApplySelect(${parseInt(inv.id, 10)})"></td>
        <td>${_finEsc(inv.invoice_number || `#${inv.id}`)}</td>
        <td>${_rcvInvStatusBadge(inv.status)}</td>
        <td>${lines.map(li => _pvMoney(li.amount)).join('<br>')}</td>
        <td>${_pvMoney(outstanding)}</td>
        <td>${lines.length > 1 ? 'per line' : _pvMoney(est)}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function _founderApplySelect(invoiceId) {
  const ctx = _founderApply;
  if (!ctx) return;
  ctx.selectedId = invoiceId;
  const inv = ctx.invoices.find(i => String(i.id) === String(invoiceId));
  const allLines = inv ? _founderMatchingLines(inv, ctx.grant) : [];
  // Filter to lines this grant isn't already applied to — the row was
  // disabled in the outer table when this filter would return empty, so we
  // don't expect to hit that branch here, but guard defensively.
  const lines = allLines.filter(li => !ctx.appliedLineItemIds.has(parseInt(li.id, 10)));
  const lineWrap = document.getElementById('founder-apply-line-wrap');
  const lineSel = document.getElementById('founder-apply-line');
  // Without line_item_id the server takes the first positive matching line, so
  // the picker only appears when there is a real choice to make.
  lineWrap.style.display = lines.length > 1 ? '' : 'none';
  lineSel.innerHTML = lines.map(li => `<option value="${li.id}">${_finEsc(li.description || `Line #${li.id}`)} (${_pvMoney(li.amount)})</option>`).join('');
  document.getElementById('founder-apply-msg').innerHTML = '';
  _founderApplyRecompute();
}

function _founderApplyRecompute() {
  const ctx = _founderApply;
  const preview = document.getElementById('founder-apply-preview');
  const btn = document.getElementById('founder-apply-submit');
  if (!ctx || !preview || !btn) return;
  const inv = ctx.invoices.find(i => String(i.id) === String(ctx.selectedId));
  btn.disabled = !inv;
  if (!inv) { preview.innerHTML = ''; return; }
  const lines = _founderMatchingLines(inv, ctx.grant);
  const lineId = lines.length > 1 ? document.getElementById('founder-apply-line').value : lines[0]?.id;
  const line = lines.find(li => String(li.id) === String(lineId)) || lines[0];
  const overrideRaw = document.getElementById('founder-apply-override').value;
  const override = parseFloat(overrideRaw);
  const amount = overrideRaw !== '' && !isNaN(override) ? override : _founderEstimate(ctx.grant, line);
  const outstanding = _founderInvoiceOutstanding(inv);
  preview.innerHTML = amount > outstanding + 0.005
    ? _founderInfoBox(`<strong>${_pvMoney(amount)}</strong> is more than the ${_pvMoney(outstanding)} outstanding on ${_finEsc(inv.invoice_number)}. The server refuses a discount above the outstanding balance, so enter a smaller override amount.`, 'gold')
    : _founderInfoBox(`Applies <strong>${_pvMoney(amount)}</strong> to ${_finEsc(inv.invoice_number)}, leaving about <strong>${_pvMoney(outstanding - amount)}</strong> outstanding.`);
}

async function _founderSubmitApply() {
  const ctx = _founderApply;
  const msgEl = document.getElementById('founder-apply-msg');
  const inv = ctx?.invoices.find(i => String(i.id) === String(ctx.selectedId));
  if (!inv) return;
  msgEl.innerHTML = '';
  const g = ctx.grant;
  const payload = {};
  if (_founderMatchingLines(inv, g).length > 1) payload.line_item_id = parseInt(document.getElementById('founder-apply-line').value, 10);
  const overrideRaw = document.getElementById('founder-apply-override').value;
  if (overrideRaw !== '') {
    const n = parseFloat(overrideRaw);
    if (isNaN(n) || n <= 0) { _pvShowCoralMsg(msgEl, 'An override amount has to be above 0.'); return; }
    payload.override_amount = n;
  }
  const btn = document.getElementById('founder-apply-submit');
  btn.disabled = true;
  const res = await apiFetch(`${_FOUNDER_API}/${g.id}/apply-to-invoice/${inv.id}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  btn.disabled = false;
  if (res && res.ok) {
    const body = await res.json().catch(() => ({}));
    _coaCloseModal('founder-apply-modal-overlay');
    showToast(`Applied ${_pvMoney(body.application?.applied_amount)} to ${inv.invoice_number}. Outstanding is now ${_pvMoney(body.invoice_outstanding_after)}.`, 'success');
    const drawer = document.getElementById('founder-history-drawer');
    if (drawer && String(drawer.dataset.grantId) === String(g.id)) _founderLoadHistory(g);
    await _founderAfterChange();
    return;
  }
  // 409s (already applied to this line, above outstanding, grant not usable,
  // wrong student) are written for the operator and shown as sent.
  _pvShowCoralMsg(msgEl, res ? await parseApiError(res) : 'Network error. Refresh the invoice before retrying; the discount may have been applied.');
}

// ── Renew for another academic year (POST /{id}/clone-to-ay/{ay_id}) ─────
// §Q.10: copies amount or percent, reason and notes into a fresh grant for the
// target year and re-runs the threshold decision, so a clone at or below it is
// applied at once and one above it waits for a second approver. The source
// grant is not changed. 409 means a live grant already covers the target year;
// 400 means the target is the grant's own year.
function _founderOpenRenew(id) {
  const g = _founderGrantById(id);
  if (!g) return;
  _founderRenew = { grant: g };
  const years = _rcvAcademicYearsCache || [];
  const own = years.find(y => String(y.id) === String(g.academic_year_id));
  // Preselect the first year that starts after the grant's own.
  const next = years
    .filter(y => String(y.id) !== String(g.academic_year_id) && (!own || String(y.start_date || '') > String(own.start_date || '')))
    .sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')))[0];
  document.getElementById('founder-renew-modal-overlay')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'founder-renew-modal-overlay';
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;overflow:auto;padding:24px;';
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:8px;padding:24px;width:500px;max-width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.2);">
      <h3 style="margin:0 0 6px;font-size:1.05rem;color:var(--navy-700,#2c3e50);">Renew Grant for Another Year</h3>
      <p style="margin:0 0 10px;font-size:0.86rem;color:var(--grey-600,#666);">
        <strong>${_finEsc(_rcvStudentName(g.student_id))}</strong> &middot; ${_finEsc(_rcvFeeItemName(g.fee_item_id))} &middot; <strong>${_founderDiscountLabel(g)}</strong> &middot; currently ${_finEsc(_founderYearName(g.academic_year_id))}
      </p>
      ${_founderInfoBox('Creates a new grant for the year you pick, with the same amount, reason and notes. It goes through the approval decision again: at or below the threshold it applies straight away, above it it waits for a second approver. This grant is not changed.')}
      <div class="fin-form-group">
        <label class="fin-form-label">Target Academic Year <span class="fin-required">*</span></label>
        <select id="founder-renew-year" class="fin-form-select" onchange="document.getElementById('founder-renew-year-err').textContent='';document.getElementById('founder-renew-msg').innerHTML='';">
          <option value="">${_finEsc(lookupPlaceholder('academic-years', 'Please Select'))}</option>
          ${_founderYearOptions(next?.id)}
        </select>
        <span class="fin-field-error" id="founder-renew-year-err"></span>
      </div>
      <div id="founder-renew-msg"></div>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
        <button class="fin-btn-cancel" onclick="_coaCloseModal('founder-renew-modal-overlay')">Cancel</button>
        <button class="fin-btn-teal" id="founder-renew-submit" onclick="_founderSubmitRenew()">Renew Grant</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

async function _founderSubmitRenew() {
  const g = _founderRenew?.grant;
  if (!g) return;
  const errEl = document.getElementById('founder-renew-year-err');
  const msgEl = document.getElementById('founder-renew-msg');
  errEl.textContent = '';
  msgEl.innerHTML = '';
  const ayId = parseInt(document.getElementById('founder-renew-year').value, 10);
  if (!ayId) { errEl.textContent = 'Pick the academic year to renew into.'; return; }
  if (String(ayId) === String(g.academic_year_id)) { errEl.textContent = `Pick a different AY — this grant is already for ${_founderYearName(ayId)}.`; return; }
  const btn = document.getElementById('founder-renew-submit');
  btn.disabled = true;
  const res = await apiFetch(`${_FOUNDER_API}/${g.id}/clone-to-ay/${ayId}`, { method: 'POST' });
  btn.disabled = false;
  if (res && res.ok) {
    const clone = await res.json().catch(() => null);
    _coaCloseModal('founder-renew-modal-overlay');
    _founderRenew = null;
    showToast(_founderOutcomeText(clone, { target: ` for ${_founderYearName(ayId)}` }), 'success');
    await _founderAfterChange();
    if (clone?.id) await _founderOpenHistory(clone.id, clone);
    return;
  }
  if (!res) { _pvShowCoralMsg(msgEl, 'Network error. Refresh before retrying; the grant may already have been renewed.'); return; }
  const detail = await parseApiError(res);
  const lead = res.status === 409 ? 'A live grant already exists for the target year — cancel it first.'
    : res.status === 400 ? 'Pick a different AY.'
    : '';
  _pvShowCoralMsg(msgEl, lead ? `${lead} ${detail}` : detail);
}

// ── History drawer ───────────────────────────────────────────────────────
// `grant` is passed when the grant may not be in the current list (a statement
// link, or a renew whose clone the filters hide); it is added so the drawer's
// own actions can find it.
async function _founderOpenHistory(id, grant = null) {
  const g = grant || _founderGrantById(id);
  if (!g) return;
  if (grant && !_founderGrantById(grant.id)) _founderGrants.push(grant);
  document.getElementById('founder-history-drawer')?.remove();
  const field = (label, html, full = false) => `<div style="${full ? 'grid-column:1 / -1;' : ''}"><div style="color:#888;font-size:0.76rem;">${label}</div><div>${html}</div></div>`;
  const canApply = g.status === 'approved' && g.is_active && canAdd('finance.cancellations');
  const canRenew = g.status !== 'rejected' && canAdd('finance.setup');
  const wrap = document.createElement('div');
  wrap.id = 'founder-history-drawer';
  wrap.dataset.grantId = g.id;
  wrap.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:9998;display:flex;justify-content:flex-end;';
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  wrap.innerHTML = `
    <aside role="dialog" aria-label="Grant history" style="background:var(--white);width:660px;max-width:100%;height:100%;overflow:auto;box-shadow:-4px 0 24px rgba(0,0,0,0.18);padding:22px 24px;box-sizing:border-box;">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <div style="flex:1;">
          <h3 style="margin:0;font-size:1.05rem;color:var(--navy-700,#2c3e50);">${_finEsc(_rcvStudentName(g.student_id))}</h3>
          <div style="font-size:0.85rem;color:var(--grey-600,#666);">${_finEsc(_rcvFeeItemName(g.fee_item_id))} &middot; ${_finEsc(_founderYearName(g.academic_year_id))}</div>
        </div>
        <button class="fin-btn-outline" style="padding:3px 10px;font-size:0.8rem;" onclick="_coaCloseModal('founder-history-drawer')">Close</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;margin:16px 0;font-size:0.86rem;">
        ${field('Discount', `<strong>${_founderDiscountLabel(g)}</strong>`)}
        ${field('Status', _founderStatusBadge(g))}
        ${field('Created By', `${_finEsc(_founderStaffLabel(g.created_by))} &middot; ${_pvDate(g.created_at)}`)}
        ${field('Needed Threshold Approval', g.requires_approval ? 'Yes' : 'No')}
        ${g.approved_at ? field('Approved By', `${_finEsc(_founderStaffLabel(g.approved_by))} &middot; ${_pvDate(g.approved_at)}`) : ''}
        ${field('Reason', _finEsc(g.reason || '—'), true)}
        ${g.notes ? field('Notes', _finEsc(g.notes), true) : ''}
        ${g.status === 'rejected' && g.rejection_reason ? field('Rejection Reason', `<span style="color:var(--coral-600);">${_finEsc(g.rejection_reason)}</span>`, true) : ''}
      </div>
      ${canApply || canRenew ? `<div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${canApply ? `<button class="fin-btn-teal" onclick="_founderOpenApply(${g.id})">Apply to Invoice</button>` : ''}
        ${canRenew ? `<button class="fin-btn-outline" onclick="_founderOpenRenew(${g.id})">Renew for Next Year</button>` : ''}
      </div>` : ''}
      <h4 style="margin:20px 0 8px;font-size:0.95rem;color:var(--navy-700,#2c3e50);">Applications</h4>
      <div id="founder-history-list"><p style="color:#888;">Loading&#8230;</p></div>
    </aside>`;
  document.body.appendChild(wrap);
  await _founderLoadHistory(g);
}

// FounderDiscountApplicationRead carries fee_invoice_id only, so invoice
// numbers come from the student's invoice list, fetched alongside.
async function _founderLoadHistory(g) {
  const seq = ++_founderHistorySeq;
  const [res, invRes] = await Promise.all([
    apiFetch(`${_FOUNDER_API}/${g.id}/applications`),
    apiFetch(`${API_BASE}/receivables/fee-invoices?student_id=${parseInt(g.student_id, 10)}`),
  ]);
  const listEl = document.getElementById('founder-history-list');
  const drawer = document.getElementById('founder-history-drawer');
  if (seq !== _founderHistorySeq || !listEl || String(drawer?.dataset.grantId) !== String(g.id)) return;
  if (!res || !res.ok) {
    const msg = res ? await parseApiError(res) : 'Could not reach the server.';
    if (seq !== _founderHistorySeq || !listEl.isConnected) return;
    listEl.innerHTML = `<p style="color:var(--coral-600);">Could not load applications: ${_finEsc(msg)}</p>`;
    return;
  }
  const apps = _toArray(await res.json().catch(() => []));
  const invoices = invRes && invRes.ok ? _toArray(await invRes.json().catch(() => [])) : [];
  if (seq !== _founderHistorySeq || !listEl.isConnected) return;
  if (!apps.length) {
    listEl.innerHTML = `<p style="color:var(--grey-600,#666);font-size:0.86rem;">Not applied to any invoice yet.</p>`;
    return;
  }
  const invNo = id => invoices.find(i => String(i.id) === String(id))?.invoice_number || `#${id}`;
  const appStatus = s => s === 'reversed'
    ? `<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:0.74rem;font-weight:600;background:#fee2e2;color:#991b1b;">Reversed</span>`
    : `<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:0.74rem;font-weight:600;background:#d1fae5;color:#065f46;">Applied</span>`;
  listEl.innerHTML = `<div class="fin-table-wrap"><table class="fin-table">
    <thead><tr><th>DATE</th><th>INVOICE</th><th>AMOUNT</th><th>MODE</th><th>JE</th></tr></thead>
    <tbody>${apps.map(a => {
      const invId = parseInt(a.fee_invoice_id, 10);
      return `<tr>
        <td style="white-space:nowrap;">${_pvDate(a.created_at)}</td>
        <td><a href="#" onclick="_coaCloseModal('founder-history-drawer');window._rcvCurrentInvoiceId=${invId};loadInvoiceDetailView(document.getElementById('main-content'),${invId});return false;">${_finEsc(invNo(invId))}</a></td>
        <td>${_pvMoney(a.applied_amount)}</td>
        <td style="white-space:nowrap;">${_finEsc(_FOUNDER_MODE_LABELS[a.mode] || a.mode || '—')} ${appStatus(a.status)}</td>
        <td>${a.journal_entry_id
          ? `<a href="#" onclick="_coaCloseModal('founder-history-drawer');_jeOpenDetail(${parseInt(a.journal_entry_id, 10)});return false;">View JE</a>`
          : '<span style="color:#888;" title="Discounted when the invoice was generated, so there is no separate entry.">—</span>'}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}
