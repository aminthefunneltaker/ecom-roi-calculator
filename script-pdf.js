/* ============================================================
   ecom-roi-calculator — per-tab "Download PDF" (print-to-PDF)
   Zack, 2026-09-07. Reads live app state (global S + rendered
   output ids) into a clean, printable document and calls
   window.print() → user picks "Save as PDF". Works fully
   offline (no CDN lib), native print quality, wide tables
   never truncated (vertical/narrow layout + cell wrap).
   Calculation LOGIC is not touched — this file only reads
   already-computed values and mirrors S.
   ============================================================ */
(function () {
  'use strict';
  var PA = document.getElementById('printArea');
  if (!PA) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }
  function g(id) { return document.getElementById(id); }
  function txt(id) { var el = g(id); return (el && el.textContent) ? el.textContent : '—'; }
  function fmtDate() {
    try { return new Date().toLocaleString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return new Date().toLocaleString(); }
  }
  function cell(label, value, cls) { return '<tr><th>' + label + '</th><td' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</td></tr>'; }
  function pkgs() { return Array.isArray(S && S.packages) ? S.packages : []; }

  function sectionTitle(num, t) {
    return '<div class="p-sec-head"><span class="p-num">' + num + '</span><span class="p-sec-t">' + t + '</span></div>';
  }

  function buildMain() {
    var H = [];
    H.push('<div class="p-doc">');
    H.push('<div class="p-head"><div class="p-title">Meta Ads Profit Calculator</div>'
      + '<div class="p-sub">Profitability &amp; Target</div>'
      + '<div class="p-meta">Exported ' + fmtDate() + '</div></div>');

    // 1 — Settings
    var primaryName = '';
    var pk = pkgs();
    var c0 = null;
    if (pk[S.primary]) { primaryName = pk[S.primary].name || ('Package ' + (S.primary + 1)); c0 = calcPackage(pk[S.primary]); }
    var commTxt = 'OFF (manual)';
    if (S.commissionEnabled) {
      commTxt = 'ON — Marketer ' + (S.commissionPct) + '% · target RM' + Number(S.targetCommission || 0).toLocaleString('en-US') + '/month';
    }
    H.push('<div class="p-sec">' + sectionTitle(1, 'Settings') + '<table class="p-kv">'
      + cell('Primary Package', esc(primaryName || '—'))
      + cell('Meta Ads Tax Rate', S.taxRate + '%')
      + cell('Target Net Profit', S.profitPct + '% of gross profit')
      + cell('Marketer Commission', esc(commTxt))
      + '</table></div>');

    // 2 — Per-order profitability
    H.push('<div class="p-sec">' + sectionTitle(2, 'Profitability (per order)') + '<div class="p-grid p-g4">'
      + '<div class="p-tile hl"><div class="p-k">Target Net Profit</div><div class="p-v">' + txt('targetNetProfit') + '</div><div class="p-c">per order</div></div>'
      + '<div class="p-tile"><div class="p-k">CPP</div><div class="p-v">' + txt('cppIncTax') + '</div><div class="p-c">Incl. tax</div><div class="p-v sm">' + txt('cppExTax') + '</div><div class="p-c">Excl. tax</div></div>'
      + '<div class="p-tile"><div class="p-k">ROAS</div><div class="p-v">' + txt('roasIncTax') + '</div><div class="p-c">Incl. tax</div><div class="p-v sm">' + txt('roasExTax') + '</div><div class="p-c">Excl. tax</div></div>'
      + '<div class="p-tile"><div class="p-k">ROI</div><div class="p-v">' + txt('roi') + '</div><div class="p-c">Target net ÷ CPP</div></div>'
      + '</div></div>');

    // 3 — Package economics
    H.push('<div class="p-sec">' + sectionTitle(3, 'Package Economics (per order)'));
    if (!pk.length) {
      H.push('<table class="p-kv">' + cell('Packages', 'None') + '</table>');
    } else {
      var rows = ['<table class="p-econ"><thead><tr><th class="left">Package</th><th>SKUs in package</th><th>Regular</th><th>Selling / AOV</th><th>COGS</th><th>Gross Profit</th><th>Margin</th></tr></thead><tbody>'];
      pk.forEach(function (p, i) {
        var c = calcPackage(p);
        var isP = i === S.primary;
        var skus = (Array.isArray(p.skus) && p.skus.length ? p.skus : [{ qty: 1, productCost: 0 }]).map(function (s) {
          var q = Number(s.qty) || 1; var n = (s.name && String(s.name).trim()) ? String(s.name).trim() : 'SKU';
          return esc(q) + ' × ' + esc(n) + ' @ ' + money(Number(s.productCost) || 0);
        }).join('<br>');
        var ship = 'Shipping: seller ' + money(c.shippingCost)
          + (p.freeShip ? ' · free shipping ON' : ' · customer charge ' + money(c.shippingCharge));
        rows.push('<tr>'
          + '<td class="left"><span class="p-pkgname">' + esc(p.name || ('Package ' + (i + 1))) + '</span>'
          + (isP ? '<span class="p-badge">Primary</span>' : '')
          + '<span class="p-ship">' + ship + '</span></td>'
          + '<td class="skus">' + skus + '</td>'
          + '<td>' + money(c.regularPackage) + '</td>'
          + '<td class="strong">' + money(c.sellingPackage) + '</td>'
          + '<td>' + money(c.cogs) + '</td>'
          + '<td class="strong">' + money(c.grossProfit) + '</td>'
          + '<td>' + (c.grossMargin * 100).toFixed(2) + '%</td>'
          + '</tr>');
      });
      rows.push('</tbody></table>');
      H.push(rows.join(''));
    }
    H.push('</div>');

    // 4 — Monthly & Daily targets
    H.push('<div class="p-sec">' + sectionTitle(4, 'Client / Marketer Target'));
    var reqNet = g('requiredNet') ? g('requiredNet').value : '';
    var reqNetFmt = '—';
    if (reqNet !== '' && reqNet != null) { reqNetFmt = money(parseFloat(String(reqNet).replace(/,/g, '')) || 0); }
    H.push('<table class="p-kv">' + cell('Required Net Profit', reqNetFmt, 'strong') + '</table>');
    H.push('<div class="p-two">'
      + '<div class="p-half"><div class="p-sec-mini">Monthly Target <em>30-day</em></div><table class="p-kv">'
      + cell('Orders', txt('reqOrders'))
      + cell('Sales', txt('reqSales'))
      + cell('Ads Spent — Incl. tax', txt('reqAdsInc'))
      + cell('Ads Spent — Excl. tax', txt('reqAdsEx'))
      + (S.commissionEnabled ? cell('Business Share', txt('businessShare')) : '')
      + '</table></div>'
      + '<div class="p-half"><div class="p-sec-mini">Daily Target <em>month ÷ 30</em></div><table class="p-kv">'
      + cell('Orders', txt('dailyOrders'))
      + cell('Sales', txt('dailySales'))
      + cell('Ads Spent — Incl. tax', txt('dailyAdsInc'))
      + cell('Ads Spent — Excl. tax', txt('dailyAdsEx'))
      + '</table></div>'
      + '</div></div>');

    H.push('</div>');
    return H.join('');
  }

  function buildCurrent() {
    var H = [];
    H.push('<div class="p-doc">');
    H.push('<div class="p-head"><div class="p-title">Meta Ads Profit Calculator</div>'
      + '<div class="p-sub">Current Performance</div>'
      + '<div class="p-meta">Exported ' + fmtDate() + '</div></div>');

    // 1 — Spend
    var spendRaw = g('currentAdsSpend') ? g('currentAdsSpend').value : '';
    var spendFmt = money(parseFloat(String(spendRaw || '0').replace(/,/g, '')) || 0);
    H.push('<div class="p-sec">' + sectionTitle(1, 'Actual Spend &amp; Orders')
      + '<table class="p-kv">' + cell('Ads Spend', spendFmt, 'strong') + '</table></div>');

    // 2 — Actual orders by package
    var pk = pkgs();
    H.push('<div class="p-sec">' + sectionTitle(2, 'Actual Orders by Package') + '<table class="p-kv">');
    if (!pk.length) { H.push(cell('Packages', 'None')); }
    else {
      pk.forEach(function (p, i) {
        var orders = Number(p.currentOrders) || 0;
        H.push(cell(esc(p.name || ('Package ' + (i + 1))), Number(orders).toLocaleString('en-US')));
      });
    }
    H.push('</table></div>');

    // 3 — Results
    H.push('<div class="p-sec">' + sectionTitle(3, 'Performance Results') + '<div class="p-grid p-g2">'
      + '<div class="p-tile"><div class="p-k">Total Orders</div><div class="p-v">' + txt('currentOrders') + '</div></div>'
      + '<div class="p-tile"><div class="p-k">Blended AOV</div><div class="p-v">' + txt('currentAov') + '</div></div>'
      + '<div class="p-tile"><div class="p-k">Total Revenue</div><div class="p-v">' + txt('currentRevenue') + '</div></div>'
      + '<div class="p-tile"><div class="p-k">Total COGS</div><div class="p-v">' + txt('currentCogs') + '</div></div>'
      + '<div class="p-tile"><div class="p-k">Gross Profit</div><div class="p-v">' + txt('currentGrossProfit') + '</div></div>'
      + '<div class="p-tile"><div class="p-k">CPP</div><div class="p-v">' + txt('currentCpp') + '</div></div>'
      + '<div class="p-tile"><div class="p-k">ROAS</div><div class="p-v">' + txt('currentRoas') + '</div></div>'
      + '<div class="p-tile"><div class="p-k">ROI</div><div class="p-v">' + txt('currentRoi') + '</div></div>'
      + '</div></div>');

    // 4 — Net result
    var nr = g('currentNetProfit');
    var isLoss = nr ? nr.classList.contains('loss') : false;
    H.push('<div class="p-sec">' + sectionTitle(4, 'Net Result')
      + '<div class="p-net' + (isLoss ? ' loss' : '') + '"><div class="p-k">Net Profit / Loss</div>'
      + '<div class="p-v">' + txt('currentNetProfit') + '</div>'
      + '<div class="p-c">' + (isLoss ? 'Operating at a loss' : 'Net position after ads spend') + '</div></div></div>');

    H.push('</div>');
    return H.join('');
  }

  function doExport(tab) {
    try {
      PA.innerHTML = (tab === 'current') ? buildCurrent() : buildMain();
      window.print();
    } catch (err) {
      PA.innerHTML = '<div class="p-doc"><div class="p-head"><div class="p-title">Meta Ads Profit Calculator</div>'
        + '<div class="p-sub">Sorry, the PDF could not be prepared.</div></div>'
        + '<p>Please try the browser print option instead.</p></div>';
    }
  }

  var bMain = g('pdfMainBtn');
  if (bMain) bMain.addEventListener('click', function () { doExport('main'); });
  var bCur = g('pdfCurrentBtn');
  if (bCur) bCur.addEventListener('click', function () { doExport('current'); });
})();
