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
