// ============================================================================
// SHARED PRINT LETTERHEAD — js/print-letterhead.js
// ============================================================================
// One source of truth for the school's letterhead on everything the system
// prints: the crest at the top centre, the four header lines, the running
// footer, and the Payment Details panel that invoices, statements and receipts
// carry.
//
// Header/footer copy is transcribed verbatim from the school's own Word
// letterhead (the "Term 1 Enrichment Clubs" circular, 11 Sep 2026):
//   header  Calibri Bold 12pt title + three Calibri Bold 8pt lines, ink #222A35
//   footer  Calibri Italic 9pt, same ink, centred
// The trailing " •" on the tagline is in that source document. It is
// reproduced here on purpose — change SOIS_LETTERHEAD.tagline if the school
// wants it dropped, and it disappears from every document at once.
//
// Two rendering paths, one look:
//
//   1. Standalone documents (window.open + document.write) — the fee
//      statement, the fee invoice, the receipt, the class asset summary.
//      soisPrintDocHtml() builds the whole page; soisDocCss() carries the
//      navy/gold theme those documents already shared by copy-paste.
//
//   2. The app's own Ctrl+P / "Print" buttons, which print the live SPA page
//      (Student Fees Status, the sponsorship receipt, the journal voucher
//      modal, the attendance register…) and the parent portal's statement and
//      invoice pages. _soisInstallAppLetterhead() puts a screen-hidden print
//      frame in <body> and moves the page's own root into it on beforeprint;
//      the @media print block in css/core.css does the rest.
//
// Both paths repeat the header and footer on EVERY printed page, and both use
// the same mechanism, because it is the only one Chrome actually honours:
//
//   header  a real <thead> on a wrapper <table>. A table header group repeats
//           at the top of every page fragment AND reserves the space, so page
//           three starts below the crest instead of under it.
//   footer  position:fixed; bottom:0, which repeats on every page pinned to
//           the page bottom, with an empty <tfoot> spacer reserving its band.
//
// The obvious alternative — both bands position:fixed with a negative offset,
// sitting in a deep @page margin — was measured and rejected: Chrome drops a
// negatively-offset fixed header from the LAST page and a negatively-offset
// fixed footer from the FIRST page, so a one-page receipt printed with neither.
// Do not "simplify" this back to negative offsets without re-printing a
// three-page invoice and checking all three pages.
// ============================================================================

const SOIS_LETTERHEAD = {
  name:    'SEVEN OAKS INTERNATIONAL SCHOOL',
  tagline: 'Rooted in God • Growing through our Pillars • From Seed to Oak •',
  address: '143 Brookview, Membley • Tel: 0712079792',
  contact: 'Website: https://sevenoaks.ac • Email: info@sevenoaks.ac',
  footer:  'Nurturing Young Minds, Shaping Tomorrow',
  ink:     '#222A35',
  logo:    'assets/images/sois-logo-horizontal.jpeg',
};

// Bank + M-Pesa only. The cheque column the old fee statement carried was
// dropped on request (2026-09-24); the M-Pesa figures are the school's live
// ones, from the same circular the letterhead comes from.
//
// The bank account is held by Seven Oaks Brookview Limited — the legal entity
// behind the school, not the trading name on the letterhead above it. That
// mismatch is correct and must stay: a parent whose transfer names the school
// instead of the account holder can have it bounced back by their bank.
const SOIS_PAYMENT_DETAILS = {
  bank:   { name: 'Co-Operative Bank of Kenya', accountName: 'Seven Oaks Brookview Limited',
            accountNo: '01103161202001', branch: 'Ruiru Nord Mall' },
  mpesa:  { businessNumber: '400 222', accountNumber: '4686#StudentName or 4686#StudentID' },
  contactEmail: 'info@sevenoaks.ac',
};

function soisEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// A document opened with window.open('') sits on about:blank, where a relative
// src resolves against nothing and the crest silently fails to print. Resolve
// it here, in the opener, where document.baseURI is the real app URL.
function soisLogoUrl() {
  try { return new URL(SOIS_LETTERHEAD.logo, document.baseURI).href; }
  catch (_) { return SOIS_LETTERHEAD.logo; }
}

// Crest top centre, then the four header lines. The crest art sits in the top
// ~85% of the source JPEG; .sois-crest-wrap clips the trailing whitespace so
// the header does not float away from the rule below it.
function soisLetterheadHtml() {
  const L = SOIS_LETTERHEAD;
  return `<div class="sois-letterhead">
      <div class="sois-crest-wrap"><img class="sois-crest" src="${soisEsc(soisLogoUrl())}" alt="Seven Oaks International School"></div>
      <div class="sois-lh-name">${soisEsc(L.name)}</div>
      <div class="sois-lh-line">${soisEsc(L.tagline)}</div>
      <div class="sois-lh-line">${soisEsc(L.address)}</div>
      <div class="sois-lh-line">${soisEsc(L.contact)}</div>
    </div>`;
}

function soisDocFooterHtml() {
  return `<div class="sois-doc-footer">${soisEsc(SOIS_LETTERHEAD.footer)}</div>`;
}

// Payment Details panel for invoices, statements and receipts. admissionNo is
// optional — when we know it, the M-Pesa cell shows the parent exactly what to
// type instead of leaving them to work the pattern out.
function soisPaymentDetailsHtml(admissionNo) {
  const p = SOIS_PAYMENT_DETAILS;
  const eg = admissionNo && String(admissionNo).trim() && String(admissionNo).trim() !== '-'
    ? `<br><span class="sois-pay-eg">e.g. 4686#${soisEsc(String(admissionNo).trim())}</span>` : '';
  return `<table class="sois-panel">
      <tr><td colspan="2" class="sois-panel-head">Payment Details</td></tr>
      <tr>
        <td class="sois-pay-col"><h4>Bank Transfer</h4>
          Bank: ${soisEsc(p.bank.name)}<br>Acc Name: ${soisEsc(p.bank.accountName)}<br>
          Acc No: ${soisEsc(p.bank.accountNo)}<br>Branch: ${soisEsc(p.bank.branch)}</td>
        <td class="sois-pay-col"><h4>M-Pesa Payment Details</h4>
          Business Number: <strong>${soisEsc(p.mpesa.businessNumber)}</strong><br>
          Account Number: <strong>${soisEsc(p.mpesa.accountNumber)}</strong>${eg}</td>
      </tr>
      <tr><td colspan="2" class="sois-pay-note">After making payment, kindly forward the M-Pesa confirmation message to the school office for receipting.</td></tr>
    </table>`;
}

// Theme for the standalone documents: navy #1d2d50 / gold #c9a227, the panels
// and money tables the fee statement, receipt and asset summary each used to
// declare for themselves, plus the letterhead geometry.
//
// Page margins match the school's Word letterhead: 19mm left/right (54pt in
// the source document), a shallow top and bottom because the thead and the
// fixed footer carry their own bands.
function soisDocCss() {
  const ink = SOIS_LETTERHEAD.ink;
  return `
    body{font-family:Arial,Helvetica,sans-serif;color:#222;max-width:760px;margin:24px auto;padding:0 16px;}

    /* ── Running header / footer frame ── */
    .sois-page{width:100%;border-collapse:collapse;}
    .sois-page>thead>tr>td,.sois-page>tbody>tr>td,.sois-page>tfoot>tr>td{padding:0;}
    .sois-page>thead>tr>td{padding-bottom:4px;}
    .sois-foot-spacer{height:0;}

    /* ── Letterhead ── */
    .sois-letterhead{text-align:center;}
    .sois-crest-wrap{height:17mm;overflow:hidden;margin-bottom:2px;}
    .sois-crest{width:44mm;height:auto;display:inline-block;}
    .sois-lh-name{font-weight:700;font-size:12pt;color:${ink};letter-spacing:0.2px;}
    .sois-lh-line{font-weight:700;font-size:8pt;color:${ink};line-height:1.45;}
    .sois-doc-footer{text-align:center;font-style:italic;font-size:9pt;color:${ink};}
    .sois-rule{border:none;border-top:3px solid #c9a227;margin:10px 0 16px;}

    /* ── Document chrome ── */
    .sois-doc-title{text-align:center;font-weight:700;margin-bottom:16px;}
    .sois-meta{text-align:center;color:#666;font-size:0.8rem;margin:0 0 16px;}
    .sois-closing{font-size:0.8rem;color:#555;margin-top:16px;}
    .sois-footnote{font-size:0.75rem;color:#777;margin:8px 0 18px;}

    /* ── Panels / money tables ── */
    .sois-panel{border:1px solid #d8d8d8;margin-bottom:14px;border-collapse:collapse;width:100%;}
    .sois-panel-head{background:#1d2d50;color:#fff;padding:8px 16px;font-weight:700;text-align:left;}
    .sois-info-cell{padding:8px 16px;border-bottom:1px solid #eee;font-size:0.9rem;vertical-align:top;}
    .sois-info-label{font-weight:700;display:inline-block;min-width:110px;}
    .sois-pay-col{padding:14px 16px;font-size:0.85rem;vertical-align:top;width:50%;}
    .sois-pay-col h4{margin:0 0 6px;color:#1d2d50;}
    .sois-pay-eg{color:#777;font-size:0.8rem;}
    .sois-pay-note{padding:0 16px 14px;font-size:0.8rem;color:#555;}
    .sois-panel td,.sois-panel th{font-size:0.9rem;}
    .acct-head th{background:#1d2d50;color:#fff;text-align:left;padding:10px 16px;}
    .acct-head th:last-child,.acct-head th.num{text-align:right;}
    .total-row td{background:#c9a227;font-weight:700;padding:10px 16px;}
    .total-row td:last-child{text-align:right;}
    .balance-row td{background:#1d2d50;color:#fff;font-weight:700;padding:10px 16px;}
    .balance-row td:last-child{text-align:right;}
    .arrears{background:#efece4;padding:8px 16px;font-weight:700;display:flex;justify-content:space-between;margin-bottom:14px;}

    @page{size:A4;margin:12mm 19mm 10mm;}
    @media print{
      body{max-width:none;margin:0;padding:0;}
      .sois-foot-spacer{height:12mm;}
      .sois-doc-footer{position:fixed;bottom:0;left:0;right:0;}
      .no-print{display:none !important;}
      .sois-panel-head,.acct-head th,.total-row td,.balance-row td,.arrears,tfoot td{
        -webkit-print-color-adjust:exact;print-color-adjust:exact;}
      tr{page-break-inside:avoid;}
      thead{display:table-header-group;}
    }`;
}

// Assembles a whole standalone printable document.
//   title           browser tab / PDF filename
//   docTitle        the centred line under the gold rule ("Official Payment Receipt")
//   bodyHtml        the document itself
//   admissionNo     when set (and paymentDetails is not false), seeds the M-Pesa example
//   paymentDetails  true to append the Payment Details panel
//   closing         optional closing paragraph
//   extraCss        per-document additions on top of soisDocCss()
function soisPrintDocHtml(opts) {
  const o = opts || {};
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${soisEsc(o.title || SOIS_LETTERHEAD.name)}</title>
    <style>${soisDocCss()}${o.extraCss || ''}</style></head>
    <body>
      <table class="sois-page">
        <thead><tr><td>
          ${soisLetterheadHtml()}
          <hr class="sois-rule">
        </td></tr></thead>
        <tfoot><tr><td><div class="sois-foot-spacer"></div></td></tr></tfoot>
        <tbody><tr><td>
          ${o.docTitle ? `<div class="sois-doc-title">${o.docTitle}</div>` : ''}
          ${o.bodyHtml || ''}
          ${o.paymentDetails ? soisPaymentDetailsHtml(o.admissionNo) : ''}
          ${o.closing ? `<p class="sois-closing">${o.closing}</p>` : ''}
        </td></tr></tbody>
      </table>
      ${soisDocFooterHtml()}
      <div class="no-print" style="text-align:center;margin-top:20px;">
        <button onclick="window.print()" style="padding:8px 22px;font-size:0.95rem;">Print</button>
      </div>
    </body></html>`;
}

// window.open must run in the same synchronous tick as the click or the popup
// blocker eats it — see the comment on openStudentFeeStatement. Callers open
// the window first, await their fetches, then hand the HTML back here.
function soisOpenPrintWindow(loadingText) {
  const win = window.open('', '_blank');
  if (!win) return null;
  win.document.write(`<p style="font-family:Arial,sans-serif;padding:24px;color:#888;">${soisEsc(loadingText || 'Loading…')}</p>`);
  return win;
}

function soisWriteDoc(win, html) {
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ── In-app printing ─────────────────────────────────────────────────────────
// Every "Print" button that calls window.print() on the live page gets the
// same letterhead, on every page, by the same thead trick the standalone
// documents use. That needs a real table around the printed content, so on
// beforeprint the app's #main-content is moved into the frame's body cell and
// on afterprint it is put straight back where it was. Moving a node keeps its
// listeners and its identity, so nothing the modules hold a reference to
// breaks; the frame is display:none the rest of the time.
//
// The frame is rebuilt on demand because auth.js and dashboard.js both assign
// document.body.innerHTML when they swap the login page for the app shell,
// which throws away anything appended to <body> before it. Building it once at
// load as well is not redundant: it is what puts the crest in the browser's
// image cache, so the copy made at beforeprint paints immediately instead of
// printing a blank box while it fetches.
//
// Modals (the journal voucher) print from outside #main-content — they are
// unaffected by the move, and css/finance.css names the letterhead ids back in
// past its blanket visibility:hidden.
let _soisPrintReturn = null;

function _soisEnsurePrintFrame() {
  if (document.getElementById('sois-print-frame')) return;
  if (!document.body) return;
  const frame = document.createElement('table');
  frame.id = 'sois-print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.display = 'none';            // survives a stylesheet that loads late
  frame.innerHTML =
    `<thead><tr><td id="sois-print-letterhead">${soisLetterheadHtml()}<hr class="sois-rule"></td></tr></thead>` +
    `<tfoot><tr><td><div class="sois-foot-spacer"></div></td></tr></tfoot>` +
    `<tbody><tr><td id="sois-print-slot"></td></tr></tbody>`;
  const foot = document.createElement('div');
  foot.id = 'sois-print-footer';
  foot.setAttribute('aria-hidden', 'true');
  foot.style.display = 'none';
  foot.innerHTML = soisDocFooterHtml();
  document.body.appendChild(frame);
  document.body.appendChild(foot);
}

// The staff app renders into #main-content, the parent portal into #pp-root.
// First one present wins; nothing else on either page is a printable region.
const _SOIS_PRINT_ROOTS = ['main-content', 'pp-root'];

function _soisPrintRoot() {
  for (const id of _SOIS_PRINT_ROOTS) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

function _soisPrintWrap() {
  try {
    _soisPrintRestore();               // idempotent, in case afterprint was missed
    _soisEnsurePrintFrame();
    const main = _soisPrintRoot();
    const slot = document.getElementById('sois-print-slot');
    if (!main || !slot) return;
    _soisPrintReturn = { node: main, parent: main.parentNode, next: main.nextSibling };
    slot.appendChild(main);
    // .container is min-height:100vh, so the shell left behind would print as
    // a blank first page now that its only visible child has moved out. The
    // class is set only once the move actually succeeded, so a page that has
    // no #main-content still prints itself rather than nothing.
    document.body.classList.add('sois-print-wrapped');
  } catch (err) { console.error('Print letterhead: could not wrap the page.', err); }
}

function _soisPrintRestore() {
  const r = _soisPrintReturn;
  _soisPrintReturn = null;
  document.body.classList.remove('sois-print-wrapped');
  if (!r || !r.parent || !r.parent.isConnected) return;
  try {
    if (r.node) r.parent.insertBefore(r.node, r.next && r.next.isConnected ? r.next : null);
  } catch (err) { console.error('Print letterhead: could not restore the page.', err); }
}

function _soisInstallAppLetterhead() {
  _soisEnsurePrintFrame();
  try { new Image().src = soisLogoUrl(); } catch (_) {}   // warm the crest
  if (window._soisPrintHooked) return;
  window._soisPrintHooked = true;
  window.addEventListener('beforeprint', _soisPrintWrap);
  window.addEventListener('afterprint',  _soisPrintRestore);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _soisInstallAppLetterhead);
} else {
  _soisInstallAppLetterhead();
}
