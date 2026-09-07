/* ============================================================
   ecom-roi-calculator — per-tab "Download PDF" (print-to-PDF)
   REWORK (Zack, 2026-09-07).
   Purpose changed vs T7: instead of REBUILDING a bespoke "clean
   report" into #printArea (layout/theme diverged from the app),
   we now snapshot the ACTIVE tab so the PDF looks like the app
   on-screen: the live KPI card grids are deep-cloned with their
   real classes, and the input-heavy package tables are re-rendered
   read-only using the app's OWN table classes + theme tokens.
   Because styling comes from the app's stylesheet + html[data-theme]
   CSS variables, the PDF follows the ACTIVE theme (light OR dark)
   automatically — nothing is hardcoded to light.

   Rules honoured:
   - Calculation LOGIC untouched — we only read already-computed
     values (S / rendered DOM ids) and mirror S.
   - Fully offline (no CDN). window.print() → "Save as PDF".
   - Wide package tables fit the page (no column truncation): the
     print stylesheet forces table-layout:fixed + width:100% +
     min-width:0, so every package column is visible and shrinks to
     the printable width instead of being cut off.
   ============================================================ */
(function () {
  'use strict';
  var PA = document.getElementById('printArea');
  if (!PA) return;

  var APP_URL = 'https://web-app.funneltaker.com/ecom-roi-calculator/';
  var S_ = (typeof S !== 'undefined') ? S : { packages: [], primary: 0 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }
  function g(id) { return document.getElementById(id); }
  /* money() is provided by script.js (global) — do NOT shadow it. */
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/,/g, '')); return Number.isFinite(n) ? Math.max(0, n) : 0; }
  function pkg(i) { return (Array.isArray(S_.packages) && S_.packages[i]) ? S_.packages[i] : null; }
  function fmtDate() {
    try { return new Date().toLocaleString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return new Date().toLocaleString(); }
  }
  function cloneClean(sel, host) {
    /* deep-clone live output nodes, dropping ids so the snapshot can't
       collide with the real app elements still in the DOM. */
    var out = [];
    var list = (host || document).querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) {
      var c = list[i].cloneNode(true);
      var ids = c.querySelectorAll('[id]');
      for (var j = 0; j < ids.length; j++) ids[j].removeAttribute('id');
      var selfId = c.getAttribute('id'); if (selfId) c.removeAttribute('id');
      out.push(c);
    }
    return out;
  }

  /* ---------- section / page chrome builders ---------- */
  function secHead(step, title) {
    return '<div class="p-sechead"><span class="p-step">' + step + '</span><div><div class="p-h2">' + title + '</div></div></div>';
  }
  function ctxLine(html) {
    return html ? '<p class="p-ctx">' + html + '</p>' : '';
  }
  function subHead(t) {
    return '<div class="p-subh">' + t + '</div>';
  }
  function kv(label, value, cls) {
    return '<td class="row-label">' + esc(label) + '</td><td class="cell-value' + (cls ? ' ' + cls : '') + '">' + value + '</td>';
  }
  function masthead(tabLabel) {
    return '<header class="p-mast"><div class="p-mast-l"><div class="p-brand">Meta Ads Profit Calculator</div>'
      + '<div class="p-eyebrow">' + esc(tabLabel) + '</div></div>'
      + '<div class="p-stamp">Exported ' + esc(fmtDate()) + '</div></header>';
  }
  function foot() {
    return '<div class="p-foot"><div class="p-cta">Nak kira sasaran iklan anda sendiri?</div>'
      + '<a class="p-link" href="' + APP_URL + '">' + esc(APP_URL) + '</a>'
      + '<div class="p-note">Percuma &amp; berfungsi offline — Meta Ads Profit Calculator.</div>'
      + '<div class="p-made">Dibangunkan oleh Funnel Taker Marketing</div></div>';
  }

  /* ---------- read-only package tables (app-styled) ---------- */
  function pkgEconTable() {
    var pk = S_.packages || [];
    if (!pk.length) return '<div class="p-empty">No packages yet.</div>';
    var H = ['<div class="table-wrap"><table class="p-tbl"><thead><tr><th class="left">Package economics</th>'];
    pk.forEach(function (p, i) {
      var isP = i === S_.primary;
      var skus = (Array.isArray(p.skus) && p.skus.length ? p.skus : [{ name: '', qty: 1, productCost: 0 }]);
      var skuTxt = skus.map(function (s) {
        var q = num(s.qty) || 1;
        var nm = (s.name && String(s.name).trim()) ? String(s.name).trim() : 'SKU';
        return '<span class="em">' + q + ' &times; ' + esc(nm) + ' @ ' + money(num(s.productCost)) + '</span>';
      }).join('');
      var shipCost = num(p.shippingCost);
      var charge = num(p.shippingCharge);
      var shipTxt = '<span class="em">Shipping:</span> RM' + Number(shipCost).toFixed(2) + ' (seller)'
        + (p.freeShip ? ' &middot; <span class="em">free shipping ON</span>' : ' &middot; RM' + Number(charge).toFixed(2) + ' (customer)');
      H.push('<th class="p-pkgcol"><span class="p-pkgname">' + esc(p.name || ('Package ' + (i + 1))) + '</span>'
        + (isP ? '<span class="p-badge">Primary</span>' : '')
        + '<span class="p-pkgsub">' + skuTxt + '</span>'
        + '<span class="p-pkgsub">' + shipTxt + '</span></th>');
    });
    H.push('</tr></thead><tbody>');

    var rows = [
      ['COGS', function (c) { return money(c.cogs); }, ''],
      ['Regular Price', function (c) { return money(c.regularPackage); }, ''],
      ['Selling / AOV', function (c) { return money(c.sellingPackage); }, 'good'],
      ['Discount Amount', function (c) { return money(c.discountAmount); }, 'discount'],
      ['Discount Rate', function (c) { return (c.discountRate * 100).toFixed(2) + '%'; }, ''],
      ['Gross Profit', function (c) { return money(c.grossProfit); }, 'good'],
      ['Gross Margin', function (c) { return (c.grossMargin * 100).toFixed(2) + '%'; }, 'good']
    ];
    rows.forEach(function (r) {
      H.push('<tr><td class="row-label">' + r[0] + '</td>');
      pk.forEach(function (p) {
        var c = (typeof calcPackage === 'function') ? calcPackage(p) : {};
        H.push('<td class="cell-value' + (r[2] ? ' ' + r[2] : '') + '">' + r[1](c) + '</td>');
      });
      H.push('</tr>');
    });
    H.push('</tbody></table></div>');
    return H.join('');
  }

  function ordersTable() {
    var pk = S_.packages || [];
    if (!pk.length) return '<div class="p-empty">No packages yet.</div>';
    var H = ['<div class="table-wrap"><table class="p-tbl"><thead><tr><th class="left">Package</th>'];
    pk.forEach(function (p, i) {
      H.push('<th class="p-pkgcol"><span class="p-pkgname">' + esc(p.name || ('Package ' + (i + 1))) + '</span></th>');
    });
    H.push('</tr></thead><tbody><tr><td class="row-label">Actual Orders</td>');
    pk.forEach(function (p) {
      H.push('<td class="cell-value">' + Number(p.currentOrders || 0).toLocaleString('en-US') + '</td>');
    });
    H.push('</tr></tbody></table></div>');
    return H.join('');
  }

  /* ---------- snapshot assembly ---------- */
  function sheet(el, host, tabLabel) {
    /* el = reusable container node we append chrome + cloned cards to */
    el.innerHTML = '';
    el.appendChild(mastheadNode(tabLabel));
    return el;
  }
  function node(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstChild; }

  function buildMain() {
    var host = g('mainTab');
    var s = document.createElement('div');
    s.className = 'p-sheet';
    s.appendChild(node(masthead('Profitability & Target')));

    // 01 — Package Economics
    var p1 = document.createElement('section'); p1.className = 'p-panel';
    p1.innerHTML = secHead('01', 'Package Economics') + ctxLine('Semua angka <b>per order</b>. 1 package = 1 order.');
    s.appendChild(p1);
    p1.appendChild(node(pkgEconTable()));

    // 02 — Meta Ads Profitability (clone the live profit cards)
    var p2 = document.createElement('section'); p2.className = 'p-panel';
    var primaryPkg = pkg(S_.primary);
    var pName = (primaryPkg && (primaryPkg.name || '').trim()) ? primaryPkg.name : ('Package ' + (S_.primary + 1));
    p2.innerHTML = secHead('02', 'Meta Ads Profitability')
      + ctxLine('Per <b>primary package</b> (' + esc(pName) + ') &middot; Meta Ads tax '
        + esc(S_.taxRate) + '% &middot; target net profit <b>' + esc(S_.profitPct) + '%</b> of gross profit.');
    s.appendChild(p2);
    cloneClean('.profit-grid', host).forEach(function (c) { p2.appendChild(c); });

    // 03 — Client / Marketer Target (clone both target sections + business share)
    var p3 = document.createElement('section'); p3.className = 'p-panel';
    var commTxt;
    if (S_.commissionEnabled) {
      commTxt = 'Commission <b>ON</b> &middot; Marketer ' + esc(S_.commissionPct) + '% &middot; target RM'
        + Number(S_.targetCommission || 0).toLocaleString('en-US') + '/month';
    } else {
      var rn = g('requiredNet');
      var rnVal = (rn && rn.value !== '' && rn.value != null) ? money(num(rn.value)) : '—';
      commTxt = 'Commission <b>OFF</b> &middot; manual required net <b>' + rnVal + '</b>/month';
    }
    p3.innerHTML = secHead('03', 'Client / Marketer Target') + ctxLine(commTxt);
    s.appendChild(p3);
    cloneClean('.target-section', host).forEach(function (c) { p3.appendChild(c); });

    s.appendChild(node(foot()));
    return s;
  }

  function buildCurrent() {
    var host = g('currentTab');
    var s = document.createElement('div');
    s.className = 'p-sheet';
    s.appendChild(node(masthead('Current Performance')));

    // 01 — Spend + actual orders by package
    var p1 = document.createElement('section'); p1.className = 'p-panel';
    var spend = money(num((g('currentAdsSpend') && g('currentAdsSpend').value) || '0'));
    p1.innerHTML = secHead('01', 'Current Performance') + ctxLine('Actual ads spend &amp; orders.');
    s.appendChild(p1);
    p1.appendChild(node('<div class="table-wrap"><table class="p-tbl kv"><tbody><tr>'
      + kv('Ads Spend', spend, 'good') + '</tr></tbody></table></div>'));
    p1.appendChild(node(subHead('Actual Orders by Package')));
    p1.appendChild(node(ordersTable()));

    // 02 — Performance Results (clone the live result cards + net result)
    var p2 = document.createElement('section'); p2.className = 'p-panel';
    p2.innerHTML = secHead('02', 'Current Performance Results') + ctxLine('Blended from the actual mix &amp; spend above.');
    s.appendChild(p2);
    cloneClean('.performance-results', host).forEach(function (c) { p2.appendChild(c); });
    cloneClean('.net-result', host).forEach(function (c) { p2.appendChild(c); });

    s.appendChild(node(foot()));
    return s;
  }

  function doExport(tab) {
    try {
      PA.innerHTML = '';
      PA.appendChild((tab === 'current') ? buildCurrent() : buildMain());
      window.print();
    } catch (err) {
      PA.innerHTML = '';
      var fb = node('<div class="p-sheet"><div class="p-panel"><div class="p-h2">Meta Ads Profit Calculator</div>'
        + '<p class="p-ctx">Sorry, the PDF could not be prepared. Please use your browser\'s Print option instead.</p></div></div>');
      PA.appendChild(fb);
      window.print();
    }
  }

  /* mastheadNode returns a real element (escaping on inner text already done above). */
  function mastheadNode(htmlInner) {
    var d = document.createElement('div');
    d.innerHTML = '<header class="p-mast"><div class="p-mast-l"><div class="p-brand">Meta Ads Profit Calculator</div>'
      + '<div class="p-eyebrow">' + htmlInner + '</div></div>'
      + '<div class="p-stamp">Exported ' + esc(fmtDate()) + '</div></header>';
    return d.firstChild;
  }

  var bMain = g('pdfMainBtn');
  if (bMain) bMain.addEventListener('click', function () { doExport('main'); });
  var bCur = g('pdfCurrentBtn');
  if (bCur) bCur.addEventListener('click', function () { doExport('current'); });
})();
