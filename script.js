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

function inputCell(i,k,value){
  return `<input data-i="${i}" data-k="${k}" data-numeric="1" inputmode="decimal" type="text" value="${formatNumberInput(value)}">`;
}

function skuCell(p,i){
  normalizePackage(p);
  const canRemove = p.skus.length > 1;
  let h = `<div class="sku-head"><span>Name</span><span>Qty</span><span>Cost/unit</span><span></span></div>`;
  p.skus.forEach((s,si) => {
    h += `<div class="sku-item">
      <input data-i="${i}" data-sku="${si}" data-k="name" value="${esc(s.name ?? "")}" placeholder="SKU name (optional)">
      <input data-i="${i}" data-sku="${si}" data-k="qty" data-numeric="1" inputmode="decimal" type="text" value="${formatNumberInput(s.qty)}">
      <div class="unit sku-unit"><b>RM</b><input data-i="${i}" data-sku="${si}" data-k="productCost" data-numeric="1" inputmode="decimal" type="text" value="${formatNumberInput(s.productCost)}"></div>
      ${canRemove ? `<button class="remove-sku" data-i="${i}" data-del-sku="${si}" title="Remove SKU">✕</button>` : "<span></span>"}
    </div>`;
  });
  h += `<button class="add-sku" data-add-sku="${i}">+ Add SKU</button>`;
  return h;
}

function shippingCell(p,i){
  normalizePackage(p);
  const off = !!p.freeShip;
  const tipCost = "Shipping Cost — kos seller dgn courier. Sentiasa dalam COGS (per order).";
  const tipCharge = "Shipping Charge — amaun dicaj pada customer. Ditambah pada Regular/Selling Price HANYA bila Free Shipping OFF.";
  return `<div class="ship-cell">
    <div class="ship-field">
      <span class="ship-mini" title="${tipCost}">Cost seller</span>
      <div class="unit"><b>RM</b>${inputCell(i,"shippingCost",p.shippingCost)}</div>
    </div>
    <div class="ship-field${off ? " dim" : ""}">
      <span class="ship-mini" title="${tipCharge}">Charge customer</span>
      <div class="unit"><b>RM</b><input data-i="${i}" data-k="shippingCharge" data-numeric="1" inputmode="decimal" type="text" value="${formatNumberInput(p.shippingCharge)}"${off ? " disabled" : ""}></div>
    </div>
    <div class="ship-free">
      <span class="ship-mini">Free Shipping</span>
      <label class="switch"><input type="checkbox" data-i="${i}" data-free-ship="1"${off ? " checked" : ""}><span></span></label>
    </div>
  </div>`;
}

function renderTable(){
  const cols = S.packages.length;
  let html = `<thead><tr><th>PACKAGE</th>`;
  S.packages.forEach((p,i) => {
    html += `<th><div class="package-title">${esc(p.name || `Package ${i+1}`)}</div>${cols>1 ? `<button class="remove" data-remove="${i}">Remove</button>` : ""}</th>`;
  });
  html += `</tr></thead><tbody>`;
  html += `<tr class="section-row"><td colspan="${cols+1}"><div class="input-title"><b>INPUT</b><span>SKU qty × cost membina kos produk. Shipping: Cost seller sentiasa dalam COGS; Charge customer ditambah pada harga bila Free Shipping OFF. Regular/Selling Price = per pakej (1 order).</span></div></td></tr>`;

  const inputRows = [
    ["Package Name",(i,p)=>`<input data-i="${i}" data-k="name" value="${esc(p.name)}">`],
    ["SKUs in Package",(i,p)=>skuCell(p,i)],
    ["Shipping",(i,p)=>shippingCell(p,i)],
    ["Regular Price",(i,p)=>`<div class="unit"><b>RM</b>${inputCell(i,"regular",p.regular)}</div>`],
    ["Selling Price",(i,p)=>`<div class="unit"><b>RM</b>${inputCell(i,"selling",p.selling)}</div>`]
  ];
  inputRows.forEach(([label,fn]) => {
    html += `<tr><td class="row-label">${label}</td>${S.packages.map((p,i)=>`<td>${fn(i,p)}</td>`).join("")}</tr>`;
  });

  html += `<tr class="section-row"><td colspan="${cols+1}"><div class="output-title"><b>OUTPUT</b><span>Semua angka di bawah adalah PER ORDER (1 pakej = 1 order; shipping sekali per order).</span></div></td></tr>`;
  const outputs = [
    ["COGS",c=>money(c.cogs),"cell-value","(Σ SKU qty × cost) + Shipping Cost. Shipping Cost (kos seller) sentiasa dalam COGS."],
    ["Regular Price",c=>money(c.regularPackage),"cell-value","Regular Price + Shipping Charge — cuma bila Free Shipping OFF (0 tambahan bila ON)."],
    ["Selling Price",c=>money(c.sellingPackage),"good","Selling Price + Shipping Charge — cuma bila Free Shipping OFF (0 tambahan bila ON). AOV = Selling Price per order ini"],
    ["Discount Amount",c=>money(c.discountAmount),"discount","Regular Price − Selling Price (per order)"],
    ["Discount Rate",c=>(c.discountRate*100).toFixed(2)+"%","discount","Discount Amount ÷ Regular Price"],
    ["Gross Profit",c=>money(c.grossProfit),"good","Selling Price − COGS (per order)"],
    ["Gross Margin",c=>(c.grossMargin*100).toFixed(2)+"%","good","Gross Profit ÷ Selling Price"]
  ];
  outputs.forEach(([label,fn,cl,formula]) => {
    html += `<tr><td class="row-label row-label-dot"><span>${label}</span><span class="info-dot" tabindex="0" title="${formula}" aria-label="Formula: ${formula}">i</span></td>${S.packages.map(p=>`<td class="${cl} cell-value">${fn(calcPackage(p))}</td>`).join("")}</tr>`;
  });
  html += `</tbody>`;
  $("packageTable").innerHTML = html;
  $("primaryPackage").innerHTML = S.packages.map((p,i)=>`<option value="${i}" ${i===S.primary?"selected":""}>${esc(p.name||`Package ${i+1}`)}</option>`).join("");
  updateProfitability();
}

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

$("addPackage").onclick=()=>{
  const src = normalizePackage(S.packages[S.packages.length-1]);
  S.packages.push({...src, name:`Package ${S.packages.length+1}`, skus:src.skus.map(s=>({...s})), currentOrders:0});
  renderTable();
  renderCurrentPackageTable();
  updateCurrentPerformance();
};

$("packageTable").addEventListener("input",e=>{
  const t = e.target, i = t.dataset.i;
  if(i === undefined || t.dataset.freeShip !== undefined) return;
  const pkg = S.packages[Number(i)];
  if(!pkg) return;
  const si = t.dataset.sku;
  if(si !== undefined){
    const sk = pkg.skus[Number(si)];
    if(!sk) return;
    const k = t.dataset.k;
    if(k === "name") sk.name = t.value;
    else { formatLiveNumber(t); sk[k] = parseInputValue(t.value); }
    updateProfitability();
    return;
  }
  const k = t.dataset.k;
  if(k === "name"){ pkg.name = t.value; return; }
  formatLiveNumber(t);
  pkg[k] = parseInputValue(t.value);
  updateProfitability();
});

$("packageTable").addEventListener("change",e=>{
  const t = e.target, i = t.dataset.i;
  if(i === undefined) return;
  const pkg = S.packages[Number(i)];
  if(!pkg) return;
  if(t.dataset.freeShip !== undefined){
    pkg.freeShip = t.checked;
    renderTable(); // re-render: charge input di-disable+dim bila Free Shipping ON, output dikira semula
    return;
  }
  const si = t.dataset.sku;
  if(si !== undefined){
    const sk = pkg.skus[Number(si)];
    if(!sk) return;
    const k = t.dataset.k;
    if(k === "name") sk.name = t.value;
    else sk[k] = parseInputValue(t.value);
    renderTable();
    return;
  }
  const k = t.dataset.k;
  if(k === "name"){ pkg.name = t.value; renderTable(); return; }
  pkg[k] = parseInputValue(t.value);
  renderTable();
});

$("packageTable").addEventListener("click",e=>{
  const t = e.target;
  if(t.dataset.remove !== undefined){
    const i = Number(t.dataset.remove);
    S.packages.splice(i,1);
    S.primary = Math.min(S.primary, S.packages.length-1);
    renderTable();
    renderCurrentPackageTable();
    updateCurrentPerformance();
  }else if(t.dataset.addSku !== undefined){
    const i = Number(t.dataset.addSku);
    normalizePackage(S.packages[i]).skus.push({name:"", qty:1, productCost:0});
    renderTable();
  }else if(t.dataset.delSku !== undefined){
    const i = Number(t.dataset.i), si = Number(t.dataset.delSku);
    const pkg = S.packages[i];
    if(pkg && pkg.skus.length > 1){
      pkg.skus.splice(si,1);
      renderTable();
    }
  }
});

$("primaryPackage").onchange=e=>{S.primary=Number(e.target.value);updateProfitability();};
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

function renderCurrentPackageTable(){
  const cols = S.packages.length;
  let html = `<thead><tr><th>PACKAGE</th>`;
  S.packages.forEach((p,i)=>{ html += `<th>${esc(p.name || `Package ${i+1}`)}</th>`; });
  html += `</tr></thead><tbody>`;
  html += `<tr><td class="row-label">Actual Orders</td>${S.packages.map((p,i)=>`<td>${inputCell(i,"currentOrders",p.currentOrders||0)}</td>`).join("")}</tr>`;
  html += `</tbody>`;
  $("currentPackageTable").innerHTML = html;
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
renderTable();
renderCurrentPackageTable();
updateCurrentPerformance();
