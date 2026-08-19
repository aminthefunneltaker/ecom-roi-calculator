const $ = id => document.getElementById(id);
const money = x => Number.isFinite(x) ? "RM" + x.toLocaleString("en-MY", {minimumFractionDigits:2, maximumFractionDigits:2}) : "—";
const num = x => Math.max(0, Number(x) || 0);
const pct = x => num(x) / 100;
const round2 = x => Math.round((x + Number.EPSILON) * 100) / 100;

let S = {
  packages: [
    {name:"1 PCS", qty:1, productCost:15.41, shippingFee:11, regular:49, selling:36.90},
    {name:"2 PCS", qty:2, productCost:15.41, shippingFee:11, regular:49, selling:36.90},
    {name:"3 PCS", qty:3, productCost:15.41, shippingFee:11, regular:49, selling:36.90}
  ],
  primary:0,
  profitPct:20,
  taxEnabled:false,
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
  input.setSelectionRange(Math.min(pos, formatted.length), Math.min(pos, formatted.length));
}

function calcPackage(x){
  const q = num(x.qty);
  const shippingFee = round2(num(x.shippingFee));
  const cogs = round2(q * num(x.productCost) + shippingFee);
  const regularPackage = round2(q * num(x.regular) + shippingFee);
  const sellingPackage = round2(q * num(x.selling) + shippingFee);
  const grossProfit = round2(sellingPackage - cogs);
  const grossMargin = sellingPackage ? grossProfit / sellingPackage : 0;
  const discountAmount = round2(regularPackage - sellingPackage);
  const discountRate = regularPackage ? discountAmount / regularPackage : 0;
  return {shippingFee,cogs,regularPackage,sellingPackage,grossProfit,grossMargin,discountAmount,discountRate};
}

function esc(s){
  return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
}

function inputCell(i,k,value){
  return `<input data-i="${i}" data-k="${k}" data-numeric="1" inputmode="decimal" type="text" value="${formatNumberInput(value)}">`;
}

function renderTable(){
  const cols = S.packages.length;
  let html = `<thead><tr><th>PACKAGE</th>`;
  S.packages.forEach((p,i) => {
    html += `<th><div class="package-title">${esc(p.name || `Package ${i+1}`)}</div>${cols>1 ? `<button class="remove" data-remove="${i}">Remove</button>` : ""}</th>`;
  });
  html += `</tr></thead><tbody>`;
  html += `<tr class="section-row"><td colspan="${cols+1}"><div class="input-title"><b>INPUT</b><span>All figures shown below are for each unit.</span></div></td></tr>`;

  const inputRows = [
    ["Package Name",(i,p)=>`<input data-i="${i}" data-k="name" value="${esc(p.name)}">`],
    ["Quantity",(i,p)=>inputCell(i,"qty",p.qty)],
    ["Product Cost",(i,p)=>`<div class="unit"><b>RM</b>${inputCell(i,"productCost",p.productCost)}</div>`],
    ["Shipping Fee",(i,p)=>`<div class="unit"><b>RM</b>${inputCell(i,"shippingFee",p.shippingFee)}</div>`],
    ["Regular Price",(i,p)=>`<div class="unit"><b>RM</b>${inputCell(i,"regular",p.regular)}</div>`],
    ["Selling Price",(i,p)=>`<div class="unit"><b>RM</b>${inputCell(i,"selling",p.selling)}</div>`]
  ];

  inputRows.forEach(([label,fn]) => {
    html += `<tr><td class="row-label">${label}</td>${S.packages.map((p,i)=>`<td>${fn(i,p)}</td>`).join("")}</tr>`;
  });

  html += `<tr class="section-row"><td colspan="${cols+1}"><div class="output-title"><b>OUTPUT</b><span>All figures shown below are for each package.</span></div></td></tr>`;
  const outputs = [
    ["COGS",c=>money(c.cogs),"cell-value","(Product Cost × Quantity) + Shipping Fee"],
    ["Regular Price",c=>money(c.regularPackage),"cell-value","(Regular Price × Quantity) + Shipping Fee"],
    ["Selling Price",c=>money(c.sellingPackage),"good","(Selling Price × Quantity) + Shipping Fee"],
    ["Discount Amount",c=>money(c.discountAmount),"discount","Regular Price − Selling Price"],
    ["Discount Rate",c=>(c.discountRate*100).toFixed(2)+"%","discount","Discount Amount ÷ Regular Price"],
    ["Gross Profit",c=>money(c.grossProfit),"good","Selling Price − COGS"],
    ["Gross Margin",c=>(c.grossMargin*100).toFixed(2)+"%","good","Gross Profit ÷ Selling Price"]
  ];
  outputs.forEach(([label,fn,cl,formula]) => {
    html += `<tr><td class="row-label"><span>${label}</span><span class="info-dot" tabindex="0" title="${formula}" aria-label="Formula: ${formula}">i</span></td>${S.packages.map(p=>`<td class="${cl} cell-value">${fn(calcPackage(p))}</td>`).join("")}</tr>`;
  });
  html += `</tbody>`;
  $("packageTable").innerHTML = html;
  $("primaryPackage").innerHTML = S.packages.map((p,i)=>`<option value="${i}" ${i===S.primary?"selected":""}>${esc(p.name||`Package ${i+1}`)}</option>`).join("");
  updateProfitability();
}

function updateProfitability(){
  const c = calcPackage(S.packages[S.primary]);
  const targetNet = c.grossProfit * pct(S.profitPct);
  const cppEx = c.grossProfit - targetNet;
  const cppInc = cppEx * (S.taxEnabled ? 1 + pct(S.taxRate) : 1);
  const roasEx = cppEx > 0 ? c.sellingPackage / cppEx : 0;
  const roasInc = cppInc > 0 ? c.sellingPackage / cppInc : 0;
  const roi = cppEx > 0 ? targetNet / cppEx : 0;

  $("targetNetProfit").textContent = money(round2(targetNet));
  $("cppExTax").textContent = money(round2(cppEx));
  $("cppIncTax").textContent = money(round2(cppInc));
  $("roasExTax").textContent = roasEx ? roasEx.toFixed(2)+"x" : "—";
  $("roasIncTax").textContent = roasInc ? roasInc.toFixed(2)+"x" : "—";
  $("roi").textContent = roi ? roi.toFixed(2) : "—";
  updateTargets(c,targetNet,cppInc);
}

function updateTargets(c,targetNetPerOrder,cppInc){
  const ids = ["reqNet","reqOrders","reqSales","reqAds","businessShare","dailySales","dailyOrders","dailyAds"];
  if(!S.commissionEnabled){ ids.forEach(id=>$(id).textContent="—"); return; }
  const commissionPct = pct(S.commissionPct);
  const targetCommission = parseInputValue(S.targetCommission);
  if(commissionPct<=0 || targetCommission<=0 || targetNetPerOrder<=0 || cppInc<0){ ids.forEach(id=>$(id).textContent="—"); return; }

  const requiredNet = targetCommission / commissionPct;
  const ordersExact = requiredNet / targetNetPerOrder;
  const sales = ordersExact * c.sellingPackage;
  const ads = ordersExact * cppInc;
  const business = requiredNet - targetCommission;

  $("reqNet").textContent = money(round2(requiredNet));
  $("reqOrders").textContent = Math.ceil(ordersExact).toLocaleString("en-MY");
  $("reqSales").textContent = money(round2(sales));
  $("reqAds").textContent = money(round2(ads));
  $("businessShare").textContent = money(round2(business));
  $("dailySales").textContent = money(round2(sales/30));
  $("dailyOrders").textContent = Math.ceil(ordersExact/30).toLocaleString("en-MY");
  $("dailyAds").textContent = money(round2(ads/30));
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
  const p=S.packages[S.packages.length-1];
  S.packages.push({...p,name:`${S.packages.length+1} PCS`,qty:num(p.qty)+1});
  renderTable();
};

$("packageTable").addEventListener("input",e=>{
  const i=e.target.dataset.i, k=e.target.dataset.k;
  if(i===undefined) return;
  if(k === "name") S.packages[Number(i)][k] = e.target.value;
  else { formatLiveNumber(e.target); S.packages[Number(i)][k] = parseInputValue(e.target.value); }
  updateProfitability();
});

$("packageTable").addEventListener("change",e=>{
  const i=e.target.dataset.i, k=e.target.dataset.k;
  if(i===undefined) return;
  if(k === "name") S.packages[Number(i)][k] = e.target.value;
  else S.packages[Number(i)][k] = parseInputValue(e.target.value);
  renderTable();
});

$("packageTable").addEventListener("click",e=>{
  if(e.target.dataset.remove!==undefined){
    const i=Number(e.target.dataset.remove);
    S.packages.splice(i,1);
    S.primary=Math.min(S.primary,S.packages.length-1);
    renderTable();
  }
});

$("primaryPackage").onchange=e=>{S.primary=Number(e.target.value);updateProfitability();};
$("taxEnabled").onchange=e=>{S.taxEnabled=e.target.checked;updateProfitability();};
$("taxRate").addEventListener("input",e=>{formatLiveNumber(e.target);S.taxRate=parseInputValue(e.target.value);updateProfitability();});
$("commissionEnabled").onchange=e=>{$("commissionFields").classList.toggle("hidden",!e.target.checked);S.commissionEnabled=e.target.checked;updateProfitability();};
$("commissionPct").addEventListener("input",e=>{formatLiveNumber(e.target);S.commissionPct=parseInputValue(e.target.value);updateProfitability();});
$("targetCommission").addEventListener("input",e=>{formatLiveNumber(e.target);S.targetCommission=parseInputValue(e.target.value);updateProfitability();});

setProfit(20);
renderTable();
