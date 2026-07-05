// ==================== UI HELPERS ====================
// Shared utilities used across all modules.

// ── Paginated table renderer ──────────────────────────────────────────────────
// containerId   — id of the wrapping element for the table
// paginationId  — id of the element for pagination buttons (can be null)
// data          — full dataset array
// columns       — array of header label strings, e.g. ['Name', 'Status']
// renderRowFn   — function(item) => HTML string for one <tr>
// state         — object { page, perPage, activeClass } – mutated by this call
// Returns the slice rendered (useful for callers that need it).
function renderPaginatedTable(containerId, paginationId, data, columns, renderRowFn, state) {
  const container = document.getElementById(containerId);
  if (!container) return [];

  const { page = 1, perPage = 10, activeClass = 'fin-pg-active' } = state;
  const total  = data.length;
  const start  = (page - 1) * perPage;
  const paged  = data.slice(start, start + perPage);
  const pages  = Math.max(1, Math.ceil(total / perPage));

  const colHeaders = columns.map(c => `<th>${c}</th>`).join('');
  const colSpan    = columns.length;

  let rows = '';
  if (paged.length === 0) {
    rows = `<tr><td colspan="${colSpan}" class="fin-empty">No records found.</td></tr>`;
  } else {
    rows = paged.map(renderRowFn).join('');
  }

  container.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>${colHeaders}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  if (paginationId) {
    const pgEl = document.getElementById(paginationId);
    if (pgEl) {
      let btns = '';
      for (let i = 1; i <= pages; i++) {
        btns += `<button class="${i === page ? activeClass : ''}"
                         onclick="(${state.__goPage})(${i})">${i}</button>`;
      }
      pgEl.innerHTML = `<div class="fin-pagination">${btns}</div>`;
    }
  }

  return paged;
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────
// Insert animated placeholder rows while data loads.
// colCount — number of columns; rowCount — how many skeleton rows to show.
function renderSkeletonRows(containerId, colCount, rowCount = 5) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const cell = `<td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>`;
  const row  = `<tr class="skeleton-row">${cell.repeat(colCount)}</tr>`;
  container.innerHTML = `
    <div class="fin-table-wrap">
      <table class="fin-table">
        <tbody>${row.repeat(rowCount)}</tbody>
      </table>
    </div>
  `;
}

// ── CSV export ────────────────────────────────────────────────────────────────
// columns   — array of header label strings
// rows      — array of arrays of cell values
// filename  — e.g. 'student-report.csv'
function exportTableCSV(columns, rows, filename) {
  if (!rows || rows.length === 0) {
    showToast('No data to export.', 'info');
    return;
  }
  const escape = v => {
    const s = String(v ?? '').replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const header = columns.map(escape).join(',');
  const body   = rows.map(r => r.map(escape).join(',')).join('\n');
  const blob   = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = filename || 'export.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Bulk CSV/Excel upload ────────────────────────────────────────────────────
// Backed by the real POST /bulk/{module}/upload + GET /bulk/{module}/template
// endpoints (confirmed live via openapi.json). module is one of:
// 'chart-of-accounts', 'fee-invoices', 'journal-entries'.
// refreshFnName — name of a global function to call (no args) after a
// successful import, so the calling page's list re-fetches and shows the
// newly imported rows.
function renderBulkUploadBar(module, refreshFnName) {
  const uid = `bulkup-${module}`;
  return `
    <div class="fin-bulk-upload-bar">
      <input type="file" id="${uid}-file" accept=".csv,.xlsx,.xls" style="display:none;"
             onchange="handleBulkUpload('${module}','${uid}','${refreshFnName || ''}')">
      <button type="button" class="fin-bulk-btn" onclick="document.getElementById('${uid}-file').click()">&#128228; Upload CSV/Excel</button>
      <button type="button" class="fin-bulk-btn" onclick="downloadBulkTemplate('${module}')">&#128196; Download Template</button>
    </div>
    <div id="${uid}-result"></div>
  `;
}

async function handleBulkUpload(module, uid, refreshFnName) {
  const inputEl  = document.getElementById(`${uid}-file`);
  const resultEl = document.getElementById(`${uid}-result`);
  const file = inputEl && inputEl.files[0];
  if (!file) return;

  if (resultEl) resultEl.innerHTML = '<p class="sa-loading">Uploading&#8230;</p>';

  const fd = new FormData();
  fd.append('file', file);

  const res = await apiFetch(`${API_BASE}/bulk/${module}/upload`, { method: 'POST', body: fd });
  if (inputEl) inputEl.value = '';

  if (!res) { if (resultEl) resultEl.innerHTML = ''; return; }
  if (!res.ok) {
    if (resultEl) resultEl.innerHTML = `<div class="sa-toast sa-toast-error">${await parseApiError(res) || 'Upload failed.'}</div>`;
    return;
  }

  const data = await res.json();
  if (resultEl) resultEl.innerHTML = _bulkUploadResultHTML(data);

  if (refreshFnName && typeof window[refreshFnName] === 'function') window[refreshFnName]();
}

function _bulkUploadResultHTML(data) {
  const imported = data.imported ?? 0;
  const skipped  = data.skipped  ?? 0;
  const errors   = Array.isArray(data.errors) ? data.errors : [];
  const esc      = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let html = `<div class="sa-toast ${errors.length ? 'sa-toast-error' : 'sa-toast-success'}">
    Imported ${imported}${skipped ? `, skipped ${skipped}` : ''}${errors.length ? `, ${errors.length} row error(s)` : ''}.
  </div>`;

  if (errors.length) {
    const shown = errors.slice(0, 25);
    html += '<ul class="fin-bulk-error-list">' +
      shown.map(e => `<li>${esc(typeof e === 'string' ? e : JSON.stringify(e))}</li>`).join('') +
      '</ul>';
    if (errors.length > shown.length) html += `<div class="sa-empty-msg">&hellip;and ${errors.length - shown.length} more.</div>`;
  }
  return html;
}

async function downloadBulkTemplate(module) {
  const res = await apiFetch(`${API_BASE}/bulk/${module}/template`);
  if (!res || !res.ok) { showToast('Could not download template.', 'error'); return; }
  const blob = await res.blob();
  const cd    = res.headers.get('Content-Disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const filename = match ? decodeURIComponent(match[1]) : `${module}-template.csv`;
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
