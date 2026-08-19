const $=id=>document.getElementById(id);
const money=x=>Number.isFinite(x)?"RM"+x.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2}):"—";
const num=x=>Math.max(0,Number(x)||0);
const pct=x=>num(x)/100;
const round2=x=>Math.round((x+Number.EPSILON)*100)/100;

let S={
 packages:[
  {name:"1 PCS",qty:1,productCost:15.41,onlineShipping:11,codShipping:11,shippingType:"Online",regular:49,selling:36.90},
  {name:"2 PCS",qty:2,productCost:15.41,onlineShipping:11,codShipping:11,shippingType:"Online",regular:49,selling:36.90},
  {name:"3 PCS",qty:3,productCost:15.41,onlineShipping:11,codShipping:11,shippingType:"Online",regular:49,selling:36.90}
 ],
 primary:0, profitPct:20, taxEnabled:false, taxRate:8,
 commissionEnabled:false, commissionPct:40, targetCommission:4000
};

function calcPackage(x){
 const q=num(x.qty);
 const shippingFee=round2(x.shippingType==="COD"?num(x.codShipping):num(x.onlineShipping));
 const sellingPackage=round2(q*num(x.selling)+shippingFee);
 const regularPackage=round2(q*num(x.regular));
 const productCostTotal=round2(q*num(x.productCost));
 const cogs=round2(productCostTotal+shippingFee);
 const grossProfit=round2(sellingPackage-cogs);
 const grossMargin=sellingPackage?grossProfit/sellingPackage:0;
 const discountAmount=round2(regularPackage-sellingPackage);
 const discountRate=regularPackage?discountAmount/regularPackage:0;
 return {sellingPackage,regularPackage,productCostTotal,shippingFee,cogs,grossProfit,grossMargin,discountAmount,discountRate};
}

function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

function inputCell(i,k,value,step=".01",min="0"){
 return `<input data-i="${i}" data-k="${k}" type="number" min="${min}" step="${step}" value="${value}">`;
}

function renderTable(){
 const cols=S.packages.length;
 let html=`<thead><tr><th>PACKAGE</th>`;
 S.packages.forEach((p,i)=>{
   html+=`<th><div class="package-title">${esc(p.name||`Package ${i+1}`)}</div>${cols>1?`<button class="remove" data-remove="${i}">Remove</button>`:""}</th>`;
 });
 html+=`</tr></thead><tbody>`;

 html+=`<tr class="section-row"><td colspan="${cols+1}">INPUT</td></tr>`;
 const inputRows=[
  ["Package Name",(i,p)=>`<input data-i="${i}" data-k="name" value="${esc(p.name)}">`],
  ["Quantity",(i,p)=>inputCell(i,"qty",p.qty,"1","1")],
  ["Product Cost / Unit",(i,p)=>`<div class="unit"><b>RM</b>${inputCell(i,"productCost",p.productCost)}</div>`],
  ["Shipping Type",(i,p)=>`<select data-i="${i}" data-k="shippingType"><option ${p.shippingType==="Online"?"selected":""}>Online</option><option ${p.shippingType==="COD"?"selected":""}>COD</option></select>`],
  ["Shipping Fee",(i,p)=>`<div class="unit"><b>RM</b>${inputCell(i,p.shippingType==="COD"?"codShipping":"onlineShipping",p.shippingType==="COD"?p.codShipping:p.onlineShipping)}</div><small>Change type to switch fee.</small>`],
  ["Regular Price / Unit",(i,p)=>`<div class="unit"><b>RM</b>${inputCell(i,"regular",p.regular)}</div>`],
  ["Selling Price / Unit",(i,p)=>`<div class="unit"><b>RM</b>${inputCell(i,"selling",p.selling)}</div>`]
 ];
 inputRows.forEach(([label,fn])=>{
   html+=`<tr><td class="row-label">${label}</td>${S.packages.map((p,i)=>`<td>${fn(i,p)}</td>`).join("")}</tr>`;
 });

 html+=`<tr class="section-row"><td colspan="${cols+1}">OUTPUT</td></tr>`;
 const outputs=[
  ["COGS",c=>money(c.cogs),"cell-value"],
  ["Regular Price / Package",c=>money(c.regularPackage),"cell-value"],
  ["Selling Price / Package",c=>money(c.sellingPackage),"good"],
  ["Discount / Package",c=>money(c.discountAmount),"discount"],
  ["Discount Rate",c=>(c.discountRate*100).toFixed(2)+"%","discount"],
  ["Gross Profit",c=>money(c.grossProfit),"good"],
  ["Gross Margin",c=>(c.grossMargin*100).toFixed(2)+"%","good"]
 ];
 outputs.forEach(([label,fn,cl])=>{
   html+=`<tr><td class="row-label">${label}</td>${S.packages.map(p=>`<td class="${cl} cell-value">${fn(calcPackage(p))}</td>`).join("")}</tr>`;
 });
 html+=`</tbody>`;
 $("packageTable").innerHTML=html;

 $("primaryPackage").innerHTML=S.packages.map((p,i)=>`<option value="${i}" ${i===S.primary?"selected":""}>${esc(p.name||`Package ${i+1}`)}</option>`).join("");
 updateProfitability();
}

function updateProfitability(){
 const x=S.packages[S.primary], c=calcPackage(x);
 const targetNet=c.grossProfit*pct(S.profitPct);
 const cppEx=c.grossProfit-targetNet;
 const taxMult=S.taxEnabled?1+pct(S.taxRate):1;
 const cppInc=cppEx*taxMult;
 const roasEx=cppEx>0?c.sellingPackage/cppEx:0;
 const roasInc=cppInc>0?c.sellingPackage/cppInc:0;
 const roi=cppEx>0?targetNet/cppEx:0;

 $("targetNetProfit").textContent=money(round2(targetNet));
 $("cppExTax").textContent=money(round2(cppEx));
 $("cppIncTax").textContent=money(round2(cppInc));
 $("roasExTax").textContent=roasEx?roasEx.toFixed(2)+"x":"—";
 $("roasIncTax").textContent=roasInc?roasInc.toFixed(2)+"x":"—";
 $("roi").textContent=roi?roi.toFixed(2):"—";

 updateTargets(c,targetNet,cppInc);
}

function updateTargets(c,targetNetPerOrder,cppInc){
 const ids=["reqNet","reqOrders","reqSales","reqAds","marketerShare","businessShare","dailySales","dailyOrders","dailyAds","dailyNet"];
 if(!S.commissionEnabled){ids.forEach(id=>$(id).textContent="—");return}
 const commissionPct=pct(S.commissionPct);
 const targetCommission=round2(num(S.targetCommission));
 if(commissionPct<=0 || targetCommission<=0 || targetNetPerOrder<=0 || cppInc<0){ids.forEach(id=>$(id).textContent="—");return}

 // The target commission is the marketer's agreed RM target.
 // Total required net profit BEFORE the commission split = target commission / commission %.
 const requiredNet=targetCommission/commissionPct;
 const ordersExact=requiredNet/targetNetPerOrder;
 const sales=ordersExact*c.sellingPackage;
 const ads=ordersExact*cppInc;
 const business=round2(requiredNet-targetCommission);

 $("reqNet").textContent=money(round2(requiredNet));
 $("reqOrders").textContent=Math.ceil(ordersExact).toLocaleString("en-MY");
 $("reqSales").textContent=money(round2(sales));
 $("reqAds").textContent=money(round2(ads));
 $("marketerShare").textContent=money(targetCommission);
 $("businessShare").textContent=money(round2(business));

 $("dailySales").textContent=money(round2(sales/30));
 $("dailyOrders").textContent=Math.ceil(ordersExact/30).toLocaleString("en-MY");
 $("dailyAds").textContent=money(round2(ads/30));
 $("dailyNet").textContent=money(round2(requiredNet/30));
}

function setProfit(v){
 if(v==="custom"){
   $("customProfitWrap").classList.remove("hidden");
   S.profitPct=num($("customProfit").value);
 }else{
   S.profitPct=num(v);
   $("customProfitWrap").classList.add("hidden");
 }
 document.querySelectorAll("#profitPresets button").forEach(b=>b.classList.toggle("active",b.dataset.v===String(v)));
 updateProfitability();
}

[0,20,30,40,50].forEach(v=>{
 const b=document.createElement("button");b.textContent=v+"%";b.dataset.v=v;b.onclick=()=>setProfit(v);$("profitPresets").appendChild(b);
});
const customBtn=document.createElement("button");customBtn.textContent="Custom";customBtn.dataset.v="custom";customBtn.onclick=()=>setProfit("custom");$("profitPresets").appendChild(customBtn);

$("customProfit").oninput=e=>{S.profitPct=num(e.target.value);updateProfitability()};

$("addPackage").onclick=()=>{
 const p=S.packages[S.packages.length-1];
 S.packages.push({...p,name:`${S.packages.length+1} PCS`,qty:num(p.qty)+1});
 renderTable();
};

$("packageTable").addEventListener("input",e=>{
 const i=e.target.dataset.i,k=e.target.dataset.k;
 if(i===undefined)return;
 S.packages[Number(i)][k]=k==="name"?e.target.value:num(e.target.value);
 updateProfitability();
});

$("packageTable").addEventListener("change",e=>{
 const i=e.target.dataset.i,k=e.target.dataset.k;
 if(i===undefined)return;
 S.packages[Number(i)][k]=k==="name"||k==="shippingType"?e.target.value:num(e.target.value);
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

$("primaryPackage").onchange=e=>{S.primary=Number(e.target.value);updateProfitability()};
$("taxEnabled").onchange=e=>{S.taxEnabled=e.target.checked;updateProfitability()};
$("taxRate").oninput=e=>{S.taxRate=num(e.target.value);updateProfitability()};
$("commissionEnabled").onchange=e=>{S.commissionEnabled=e.target.checked;$("commissionFields").classList.toggle("hidden",!S.commissionEnabled);updateProfitability()};
$("commissionPct").oninput=e=>{S.commissionPct=num(e.target.value);updateProfitability()};
$("targetCommission").oninput=e=>{S.targetCommission=num(e.target.value);updateProfitability()};

setProfit(20);
renderTable();
