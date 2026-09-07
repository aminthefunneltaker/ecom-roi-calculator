const $ = id => document.getElementById(id);
const money = x => Number.isFinite(x) ? "RM" + x.toLocaleString("en-MY", {minimumFractionDigits:2, maximumFractionDigits:2}) : "—";
const num = x => Math.max(0, Number(x) || 0);
const pct = x => num(x) / 100;
const round2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const formatPlain = v => Number(v || 0).toLocaleString("en-US", {minimumFractionDigits:0, maximumFractionDigits:2});

let S = {
  packages: [
    {name:"Nama pakej", skus:[{name:"SKU 1", qty:1, productCost:30}], shippingCost:4.5, shippingCharge:10, freeShip:false, regular:149, selling:89, currentOrders:0}
  ],
  primary:0,
  profitPct:20,
  taxRate:8,
  commissionEnabled:false,
  commissionPct:40,
  targetCommission:4000
};

function parseInputValue(value){
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function formatNumberInput(value){
  const raw = String(value ?? "").replace(/,/g, "");
  if(raw === "") return "";
  if(raw === ".") return "0.";
  const parts = raw.split(".");
  const intPart = (parts[0] || "0").replace(/[^0-9]/g, "") || "0";
  const decimal = parts.length > 1 ? "." + parts.slice(1).join("").replace(/[^0-9]/g, "") : "";
  return Number(intPart).toLocaleString("en-US") + decimal;
}

function formatLiveNumber(input){
  const raw = input.value;
  const start = input.selectionStart ?? raw.length;
  const digitsBefore = (raw.slice(0, start).match(/\d/g) || []).length;
  const hasDecimalBeforeCaret = raw.slice(0, start).includes(".");
  let cleaned = raw.replace(/,/g, "").replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if(firstDot >= 0){
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  if(cleaned === "") return;
  const parts = cleaned.split(".");
  const intPart = (parts[0] || "0").replace(/^0+(?=\d)/, "") || "0";
  const decimal = parts.length > 1 ? "." + parts[1] : "";
  const formatted = Number(intPart).toLocaleString("en-US") + decimal;
  input.value = formatted;

  let pos = 0, count = 0;
  while(pos < formatted.length && count < digitsBefore){
    if(/\d/.test(formatted[pos])) count++;
    pos++;
  }
  if(hasDecimalBeforeCaret){
    const dot = formatted.indexOf(".");
    if(dot >= 0) pos = Math.max(pos, dot + 1);
  }
  // type="number" inputs do not support selection APIs — guard so caret logic
  // can never throw and kill the caller's input handler mid-update.
  try {
    input.setSelectionRange(Math.min(pos, formatted.length), Math.min(pos, formatted.length));
  } catch(e) { /* number inputs ignore caret positioning */ }
}

// Model (U dibuang): package = {name, skus:[{name,qty,productCost}], shippingCost, shippingCharge,
// freeShip, regular, selling (harga PER PAKEJ/order), currentOrders}
// shippingCost  = kos seller dgn courier — SENTIASA dalam COGS.
// shippingCharge = amaun dicaj pd customer — ditambah pd harga HANYA bila Free Shipping OFF.
function normalizePackage(p){
  if(!Array.isArray(p.skus) || !p.skus.length) p.skus = [{name:"", qty:1, productCost:0}];
  p.skus.forEach(s => {
    if(s.name === undefined) s.name = "";
    if(s.qty === undefined || !(s.qty >= 0)) s.qty = 1;
    if(s.productCost === undefined || !(s.productCost >= 0)) s.productCost = 0;
  });
  if(p.shippingCost === undefined || !(p.shippingCost >= 0)) p.shippingCost = 0;
  if(p.shippingCharge === undefined || !(p.shippingCharge >= 0)) p.shippingCharge = 0;
  if(p.freeShip === undefined) p.freeShip = false;
  if(p.regular === undefined || !(p.regular >= 0)) p.regular = 0;
  if(p.selling === undefined || !(p.selling >= 0)) p.selling = 0;
  if(p.currentOrders === undefined) p.currentOrders = 0;
  delete p.shippingFee;     // legacy pre-split key (model lama)
  delete p.unitsPerOrder;   // model lama U — dibuang
  return p;
}
S.packages.forEach(normalizePackage);

// Nilai PER ORDER untuk pakej (1 pakej = 1 order; tiada darab U; shipping sekali per order).
// Shipping Cost sentiasa dalam COGS. Shipping Charge ditambah pada harga cuma bila Free Shipping OFF.
function calcPackage(x){
  const skus = (Array.isArray(x.skus) && x.skus.length) ? x.skus : [{name:"", qty:1, productCost:0}];
  const shippingCost = round2(num(x.shippingCost));
  const shippingCharge = round2(num(x.shippingCharge));
  let pieces = 0, cogsUnit = 0;
  skus.forEach(s => {
    const q = num(s.qty);
    pieces += q;
    cogsUnit += q * num(s.productCost);
  });
  cogsUnit = round2(cogsUnit);
  const added = x.freeShip ? 0 : shippingCharge; // free ship ON → charge customer diabaikan (0 tambahan)
  const cogs = round2(cogsUnit + shippingCost);
  const regularPackage = round2(num(x.regular) + added);
  const sellingPackage = round2(num(x.selling) + added);
  const grossProfit = round2(sellingPackage - cogs);
  const grossMargin = sellingPackage ? grossProfit / sellingPackage : 0;
  const discountAmount = round2(regularPackage - sellingPackage);
  const discountRate = regularPackage ? discountAmount / regularPackage : 0;
  return {shippingCost, shippingCharge, cogsUnit, pieces, cogs, regularPackage, sellingPackage, grossProfit, grossMargin, discountAmount, discountRate};
}

function esc(s){
  return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
}

function pkgName(p,i){
  return (p && String(p.name||"").trim()) ? String(p.name) : `Package ${i+1}`;
}

/* ============================================================
   SECTION 01 (Package Economics) — single-package editor + live
   read-only ALL-package compare matrix. (Zack, 2026-09-07 T9)
   Layout-only redesign. The model + calcPackage + every consumer
   (Section 02 profit cards, Section 03 targets, Current
   Performance, primary package) is UNCHANGED — we only change how
   package inputs are edited & how outputs are displayed.
   ============================================================ */

let active = 0;           // index of the package currently open in the editor

function clampIdx(v){ return Math.max(0, Math.min(v, S.packages.length-1)); }

// #primaryPackage (Section 02) options — refreshed whenever names/count change.
function syncPrimarySelect(){
  const el = $("primaryPackage");
  if(!el) return;
  el.innerHTML = S.packages.map((p,i)=>`<option value="${i}" ${i===S.primary?"selected":""}>${esc(pkgName(p,i))}</option>`).join("");
}

// pill / tab strip — one per package (name + gross profit). Active = in editor.
function renderPkgStrip(){
  const wrap = $("pkgStrip");
  if(!wrap) return;
  let h = "";
  if(S.packages.length){
    h = '<div class="pkg-pills" role="tablist" aria-label="Select a package to edit">';
    S.packages.forEach((p,i)=>{
      const c = calcPackage(p);
      const on = i===active;
      const prim = i===S.primary;
      h += `<button type="button" role="tab" aria-selected="${on}" class="pkg-pill${on?" active":""}" data-pill="${i}" title="${prim ? "Primary package — drives Section 02." : "Open this package in the editor."}">
        <span class="pp-name"><span class="pp-nm">${esc(pkgName(p,i))}</span></span>
        <span class="pp-gp">GP ${money(c.grossProfit)}</span>
      </button>`;
    });
    h += "</div>";
  }
  wrap.innerHTML = h;
}

// read-only comparison of ALL packages (drives no state — display only)
const OUTPUT_ROWS = [
  ["COGS",        c=>money(c.cogs),                        "cell-value", "(Σ SKU qty × cost) + Shipping Cost. Shipping Cost (kos seller) sentiasa dalam COGS."],
  ["Regular Price",c=>money(c.regularPackage),             "cell-value", "Regular Price + Shipping Charge — cuma bila Free Shipping OFF (0 tambahan bila ON)."],
  ["Selling Price",c=>money(c.sellingPackage),             "good",       "Selling Price + Shipping Charge — cuma bila Free Shipping OFF (0 tambahan bila ON). AOV = Selling Price per order ini"],
  ["Discount Amount",c=>money(c.discountAmount),           "discount",   "Regular Price − Selling Price (per order)"],
  ["Discount Rate", c=>(c.discountRate*100).toFixed(2)+"%","discount",  "Discount Amount ÷ Regular Price"],
  ["Gross Profit", c=>money(c.grossProfit),                "good",       "Selling Price − COGS (per order)"],
  ["Gross Margin", c=>(c.grossMargin*100).toFixed(2)+"%",  "good",       "Gross Profit ÷ Selling Price"]
];
function renderCompare(){
  const wrap = $("pkgCompare");
  if(!wrap) return;
  if(!S.packages.length){
    wrap.innerHTML = '<div class="pkg-empty">No packages yet.</div>';
    return;
  }
  let h = '<div class="table-wrap pkg-cmp-wrap"><table class="pkg-cmp"><thead><tr><th>METRIC</th>';
  S.packages.forEach((p,i)=>{
    h += `<th><div class="package-title">${esc(pkgName(p,i))}</div></th>`;
  });
  h += "</tr></thead><tbody>";
  OUTPUT_ROWS.forEach(([label,fn,cl,formula])=>{
    h += `<tr><td class="row-label row-label-dot"><span>${label}</span><span class="info-dot" tabindex="0" title="${esc(formula)}" aria-label="${esc(label)}, formula">i</span></td>`;
    S.packages.forEach(p=>{ const c=calcPackage(p); h += `<td class="${cl} cell-value">${fn(c)}</td>`; });
    h += "</tr>";
  });
  h += "</tbody></table></div>";
  wrap.innerHTML = h;
}

// --- active-package editor form ---------------------------------
function skuEditorRows(p){
  const canRemove = p.skus.length>1;
  let h = "";
  p.skus.forEach((s,si)=>{
    const del = canRemove
      ? `<button type="button" class="esku-del remove-sku" data-act="delsku" data-sku="${si}" title="Remove SKU">✕</button>`
      : `<span class="esku-del-empty" aria-hidden="true"></span>`;
    h += `<div class="esku-row">
      <input class="esku-name" type="text" data-sku="${si}" data-k="name" value="${esc(s.name??"")}" placeholder="SKU name (optional)">
      <div class="esku-meta">
        <div class="unit"><b>Qty</b><input type="text" data-numeric="1" inputmode="decimal" data-sku="${si}" data-k="qty" value="${formatNumberInput(s.qty)}"></div>
        <div class="unit"><b>RM</b><input type="text" data-numeric="1" inputmode="decimal" data-sku="${si}" data-k="productCost" value="${formatNumberInput(s.productCost)}"></div>
        ${del}
      </div>
    </div>`;
  });
  return h;
}

function renderEditor(){
  const el = $("pkgEditor");
  if(!el) return;
  if(!S.packages.length){
    el.innerHTML = '<div class="pkg-none">No packages yet — click “+ Add Package”.</div>';
    return;
  }
  const i = active, p = S.packages[i];
  normalizePackage(p);
  const off = !!p.freeShip;
  const canRemove = S.packages.length>1;
  el.innerHTML = `
    <div class="editor-head">
      <div class="editor-actions">
        <button type="button" class="ghost-btn" data-act="dup" title="Duplicate this package">⧉ Duplicate</button>
        ${canRemove ? `<button type="button" class="ghost-btn danger" data-act="del" title="Remove this package">Remove</button>` : ""}
      </div>
    </div>
    <div class="editor-grid">
      <label class="e-card e-name">
        <span class="e-label">Package Name</span>
        <input type="text" data-k="name" value="${esc(p.name??"")}" placeholder="e.g. Starter 3-in-1">
      </label>

      <div class="e-card">
        <div class="e-card-head"><span class="e-label">SKUs in Package</span>
          <button type="button" class="add-sku" data-act="addsku">+ Add SKU</button></div>
        <div class="esku-list">${skuEditorRows(p)}</div>
        <small class="e-note">COGS = Σ (qty × cost/unit) + seller shipping cost.</small>
      </div>

      <div class="e-card">
        <span class="e-label">Shipping <em class="e-subh">once per order</em></span>
        <div class="e-ship-grid">
          <label class="e-sub">Cost — seller
            <div class="unit"><b>RM</b><input type="text" data-numeric="1" inputmode="decimal" data-k="shippingCost" value="${formatNumberInput(p.shippingCost)}"></div>
            <small class="e-note">Always in COGS.</small></label>
          <label class="e-sub${off?" dim":""}">Charge — customer
            <div class="unit"><b>RM</b><input type="text" data-numeric="1" inputmode="decimal" data-k="shippingCharge" value="${formatNumberInput(p.shippingCharge)}"${off?" disabled":""}></div>
            <small class="e-note">Added to price when Free Shipping OFF.</small></label>
          <div class="e-free"><span>Free Shipping</span>
            <label class="switch"><input type="checkbox" data-free-ship="1"${off?" checked":""}><span></span></label></div>
        </div>
      </div>

      <div class="e-card">
        <span class="e-label">Pricing <em class="e-subh">per order · 1 package = 1 order</em></span>
        <div class="e-2col">
          <label class="e-sub">Regular Price
            <div class="unit"><b>RM</b><input type="text" data-numeric="1" inputmode="decimal" data-k="regular" value="${formatNumberInput(p.regular)}"></div></label>
          <label class="e-sub">Selling Price
            <div class="unit"><b>RM</b><input type="text" data-numeric="1" inputmode="decimal" data-k="selling" value="${formatNumberInput(p.selling)}"></div></label>
        </div>
      </div>
    </div>`;
}

// Cheap refresh of every READ-ONLY surface after a value changes.
// Does NOT rebuild editor inputs (so the field being typed into keeps focus).
function refreshReadonly(){
  renderPkgStrip();
  renderCompare();
  syncPrimarySelect();
  updateProfitability();
}

// Full rebuild after a structural change (add / remove / duplicate / switch pill).
function syncAll(){
  renderPkgStrip();
  renderEditor();
  renderCompare();
  syncPrimarySelect();
  renderCurrentPackageTable();
  updateCurrentPerformance();
  updateProfitability();
}

function clonePackage(src){
  normalizePackage(src);
  return {...src, name:src.name, skus:src.skus.map(s=>({...s})), currentOrders:0};
}

/* ---------- Section 01 event wiring (delegated once) ---------- */
$("pkgStrip").addEventListener("click", e=>{
  const b = e.target.closest("[data-pill]");
  if(!b) return;
  const ni = Number(b.dataset.pill);
  if(ni===active) return;
  active = ni;
  renderEditor();
  renderPkgStrip();
});

$("pkgEditor").addEventListener("input", e=>{
  const t = e.target, pkg = S.packages[active];
  if(!pkg) return;
  const si = t.dataset.sku;
  if(si !== undefined){
    const sk = pkg.skus[Number(si)];
    if(!sk) return;
    const k = t.dataset.k;
    if(k === "name"){ sk.name = t.value; return; }
    formatLiveNumber(t);
    sk[k] = parseInputValue(t.value);
    refreshReadonly();
    return;
  }
  const k = t.dataset.k;
  if(!k) return;
  if(k === "name"){ pkg.name = t.value; renderPkgStrip(); renderCompare(); syncPrimarySelect(); return; }
  formatLiveNumber(t);
  pkg[k] = parseInputValue(t.value);
  refreshReadonly();
});

$("pkgEditor").addEventListener("change", e=>{
  const t = e.target, pkg = S.packages[active];
  if(!pkg) return;
  if(t.dataset.freeShip !== undefined){
    pkg.freeShip = t.checked;
    renderEditor();   // disable + dim the customer-charge input, recompute
    refreshReadonly();
  }
});

$("pkgEditor").addEventListener("click", e=>{
  const t = e.target;
  if(t.dataset.act === undefined) return;
  const pkg = S.packages[active];
  if(t.dataset.act === "addsku" && pkg){
    normalizePackage(pkg).skus.push({name:"", qty:1, productCost:0});
    renderEditor();
    refreshReadonly();
  }else if(t.dataset.act === "delsku" && pkg && pkg.skus.length>1){
    const si = Number(t.dataset.sku);
    pkg.skus.splice(si,1);
    renderEditor();
    refreshReadonly();
  }else if(t.dataset.act === "dup" && pkg){
    const copy = clonePackage(pkg);
    copy.name = (pkgName(pkg,active).trim() + " (copy)");
    S.packages.splice(active+1, 0, copy);
    active = active+1;
    syncAll();
  }else if(t.dataset.act === "del" && pkg && S.packages.length>1){
    S.packages.splice(active,1);
    active = clampIdx(active);
    S.primary = clampIdx(S.primary);
    syncAll();
  }
});

$("addPackage").onclick=()=>{
  const src = normalizePackage(S.packages[S.packages.length-1]);
  S.packages.push({...src, name:`Package ${S.packages.length+1}`, skus:src.skus.map(s=>({...s})), currentOrders:0});
  active = S.packages.length-1;
  syncAll();
};

/* ============================================================
   SECTION 02 + 03 — profitability / targets (logic UNCHANGED)
   ============================================================ */
function updateProfitability(){
  const c = calcPackage(S.packages[S.primary]);
  const targetNet = c.grossProfit * pct(S.profitPct);
  const cppInc = c.grossProfit - targetNet;
  const taxMultiplier = 1 + pct(S.taxRate);
  const cppEx = taxMultiplier > 0 ? cppInc / taxMultiplier : cppInc;
  const roasEx = cppEx > 0 ? c.sellingPackage / cppEx : 0;
  const roasInc = cppInc > 0 ? c.sellingPackage / cppInc : 0;
  const roi = cppInc > 0 ? targetNet / cppInc : 0;

  $("targetNetProfit").textContent = money(round2(targetNet));
  $("cppExTax").textContent = money(round2(cppEx));
  $("cppIncTax").textContent = money(round2(cppInc));
  $("roasExTax").textContent = roasEx ? roasEx.toFixed(2)+"x" : "—";
  $("roasIncTax").textContent = roasInc ? roasInc.toFixed(2)+"x" : "—";
  $("roi").textContent = roi ? roi.toFixed(2) : "—";
  updateTargets(c, round2(targetNet), round2(cppInc), round2(cppEx));
}

function updateTargets(c,targetNetPerOrder,cppInc,cppEx){
  const on = S.commissionEnabled;
  const rn = $("requiredNet"), hint = $("requiredNetHint"), wrap = $("requiredNetWrap"), bwrap = $("businessShareWrap");
  rn.disabled = on;
  wrap.classList.toggle("readonly", on);
  bwrap.classList.toggle("hidden", !on);

  let requiredNet = null;
  if(on){
    const pv = pct(S.commissionPct), tc = parseInputValue(S.targetCommission);
    hint.textContent = (pv>0 && pv<=1 && tc>0)
      ? "Auto = Target Commission ÷ Marketer Commission % (read-only while Commission is ON)."
      : "Auto = Target Commission ÷ Marketer Commission % — set Marketer Commission % dan Target Commission dulu.";
    if(pv>0 && pv<=1 && tc>0){ requiredNet = tc / pv; rn.value = formatPlain(round2(requiredNet)); }
    else rn.value = "";
  }else{
    hint.textContent = "Manual input — drives Monthly & Daily targets when Commission is OFF.";
    requiredNet = parseInputValue(rn.value);
  }

  const ids = ["reqOrders","reqSales","reqAdsEx","reqAdsInc","businessShare","dailySales","dailyOrders","dailyAdsEx","dailyAdsInc"];
  const ok = requiredNet != null && requiredNet > 0 && targetNetPerOrder > 0 && cppInc >= 0;
  if(!ok){ ids.forEach(id=>{ const el=$(id); if(el) el.textContent="—"; }); return; }

  const orders = Math.max(1, Math.ceil(requiredNet / targetNetPerOrder));
  const sales = orders * c.sellingPackage;
  const adsEx = orders * cppEx;
  const adsInc = orders * cppInc;

  $("reqOrders").textContent = orders.toLocaleString("en-MY");
  $("reqSales").textContent = money(round2(sales));
  $("reqAdsEx").textContent = money(round2(adsEx));
  $("reqAdsInc").textContent = money(round2(adsInc));
  if(on) $("businessShare").textContent = money(round2(requiredNet - parseInputValue(S.targetCommission)));
  $("dailySales").textContent = money(round2(sales/30));
  $("dailyOrders").textContent = Math.ceil(orders/30).toLocaleString("en-MY");
  $("dailyAdsEx").textContent = money(round2(adsEx/30));
  $("dailyAdsInc").textContent = money(round2(adsInc/30));
}

function setProfit(v){
  if(v === "custom"){
    $("customProfitWrap").classList.remove("hidden");
    S.profitPct = parseInputValue($("customProfit").value);
  }else{
    S.profitPct = num(v);
    $("customProfitWrap").classList.add("hidden");
  }
  document.querySelectorAll("#profitPresets button").forEach(b=>b.classList.toggle("active",b.dataset.v===String(v)));
  updateProfitability();
}

[0,20,30,40,50].forEach(v=>{
  const b=document.createElement("button");
  b.textContent=v+"%"; b.dataset.v=v; b.onclick=()=>setProfit(v);
  $("profitPresets").appendChild(b);
});
const customBtn=document.createElement("button");
customBtn.textContent="Custom"; customBtn.dataset.v="custom"; customBtn.onclick=()=>setProfit("custom");
$("profitPresets").appendChild(customBtn);

$("customProfit").addEventListener("input",e=>{ formatLiveNumber(e.target); S.profitPct=parseInputValue(e.target.value); updateProfitability(); });

$("primaryPackage").onchange=e=>{S.primary=Number(e.target.value);updateProfitability();renderPkgStrip();renderCompare();};
$("taxRate").addEventListener("input",e=>{formatLiveNumber(e.target);S.taxRate=parseInputValue(e.target.value);updateProfitability();});
$("commissionEnabled").onchange=e=>{
  S.commissionEnabled = e.target.checked;
  if(S.commissionEnabled){
    // Seed usable defaults ONLY when values are missing/invalid — never overwrite
    // the marketer's own numbers when they toggle commission off and back on.
    if(S.commissionPct<=0){ S.commissionPct=40; $("commissionPct").value="40"; }
    if(S.targetCommission<=0){ S.targetCommission=4000; $("targetCommission").value="4,000"; }
  }
  $("commissionFields").classList.toggle("hidden",!S.commissionEnabled);
  updateProfitability();
};
$("commissionPct").addEventListener("input",e=>{formatLiveNumber(e.target);S.commissionPct=parseInputValue(e.target.value);updateProfitability();});
$("targetCommission").addEventListener("input",e=>{formatLiveNumber(e.target);S.targetCommission=parseInputValue(e.target.value);updateProfitability();});
$("requiredNet").addEventListener("input",e=>{
  if(S.commissionEnabled) return; // read-only auto path
  formatLiveNumber(e.target);
  updateProfitability();
});

/* ============================================================
   CURRENT PERFORMANCE tab (logic UNCHANGED)
   ============================================================ */
function renderCurrentPackageTable(){
  const cols = S.packages.length;
  let html = `<thead><tr><th>PACKAGE</th>`;
  S.packages.forEach((p,i)=>{ html += `<th>${esc(pkgName(p,i))}</th>`; });
  html += `</tr></thead><tbody>`;
  html += `<tr><td class="row-label">Actual Orders</td>${S.packages.map((p,i)=>`<td>${inputCell(i,"currentOrders",p.currentOrders||0)}</td>`).join("")}</tr>`;
  html += `</tbody>`;
  $("currentPackageTable").innerHTML = html;
}
function inputCell(i,k,value){
  return `<input data-i="${i}" data-k="${k}" data-numeric="1" inputmode="decimal" type="text" value="${formatNumberInput(value)}">`;
}

function updateCurrentPerformance(){
  let totalOrders=0,totalRevenue=0,totalCogs=0;
  S.packages.forEach(p=>{
    const orders=parseInputValue(p.currentOrders||0);
    const c=calcPackage(p); // per-order values
    totalOrders += orders;
    totalRevenue += orders*c.sellingPackage;
    totalCogs += orders*c.cogs;
  });
  const adsSpend=parseInputValue($("currentAdsSpend").value);
  const grossProfit=totalRevenue-totalCogs;
  const netProfit=grossProfit-adsSpend;
  const aov=totalOrders>0?totalRevenue/totalOrders:0;
  const cpp=totalOrders>0?adsSpend/totalOrders:0;
  const roas=adsSpend>0?totalRevenue/adsSpend:0;
  const roi=adsSpend>0?netProfit/adsSpend:0;

  $("currentOrders").textContent=totalOrders.toLocaleString("en-MY");
  $("currentAov").textContent=money(aov);
  $("currentRevenue").textContent=money(totalRevenue);
  $("currentCogs").textContent=money(totalCogs);
  $("currentGrossProfit").textContent=money(grossProfit);
  $("currentCpp").textContent=money(cpp);
  $("currentRoas").textContent=roas.toFixed(2)+"x";
  $("currentRoi").textContent=roi.toFixed(2)+"x";
  $("currentNetProfit").textContent=money(netProfit);
  $("currentNetProfit").classList.toggle("loss",netProfit<0);
}

$("currentPackageTable").addEventListener("input",e=>{
  const i=e.target.dataset.i,k=e.target.dataset.k;
  if(i===undefined || k!=="currentOrders") return;
  formatLiveNumber(e.target);
  S.packages[Number(i)].currentOrders=parseInputValue(e.target.value);
  updateCurrentPerformance();
});

$("currentAdsSpend").addEventListener("input",e=>{
  formatLiveNumber(e.target);
  updateCurrentPerformance();
});

document.querySelectorAll(".tab").forEach(tab=>{
  tab.onclick=()=>{
    document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t===tab));
    document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
    const target=tab.dataset.tab==="current"?$("currentTab"):$("mainTab");
    target.classList.add("active");
    if(tab.dataset.tab==="current"){
      renderCurrentPackageTable();
      updateCurrentPerformance();
    }
  };
});

setProfit(20);
syncAll();
