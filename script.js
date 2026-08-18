const $=id=>document.getElementById(id);
const money=n=>Number.isFinite(n)?"RM"+n.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2}):"—";
const n=v=>Math.max(0,Number(v)||0), p=v=>n(v)/100;
let S={packages:[
{name:"1 PCS",qty:1,cogs:15.41,shipping:11,shippingType:"Online",regular:49,selling:36.9},
{name:"2 PCS",qty:2,cogs:15.41,shipping:11,shippingType:"Online",regular:49,selling:36.9},
{name:"3 PCS",qty:3,cogs:15.41,shipping:11,shippingType:"Online",regular:49,selling:36.9}
],primary:0,profit:40,tax:false,taxRate:8,commission:false,commissionPct:40,targetCommission:4000};

function calc(x){let revenue=n(x.qty)*n(x.selling),product=n(x.qty)*n(x.cogs),cost=product+n(x.shipping),gross=revenue-cost;return{revenue,product,cost,gross,margin:revenue?gross/revenue:0}}
function esc(x){return String(x).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function render(){
$("packages").innerHTML=S.packages.map((x,i)=>{let c=calc(x);return `<div class="package"><div class="phead"><div class="pname">${esc(x.name||"Package "+(i+1))}</div><div class="pactions"><button data-dup="${i}">Duplicate</button>${S.packages.length>1?`<button data-rem="${i}">Remove</button>`:""}</div></div><div class="grid">
<label>Package Name<input data-i="${i}" data-k="name" value="${esc(x.name)}"></label>
<label>Quantity<input data-i="${i}" data-k="qty" type="number" min="1" value="${x.qty}"></label>
<label>COGS / Unit<div class="unit"><b>RM</b><input data-i="${i}" data-k="cogs" type="number" step=".01" value="${x.cogs}"></div></label>
<label>Shipping<div class="unit"><b>RM</b><input data-i="${i}" data-k="shipping" type="number" step=".01" value="${x.shipping}"></div></label>
<label>Shipping Type<select data-i="${i}" data-k="shippingType"><option ${x.shippingType==="Online"?"selected":""}>Online</option><option ${x.shippingType==="COD"?"selected":""}>COD</option></select></label>
<label>Regular Price / Unit<div class="unit"><b>RM</b><input data-i="${i}" data-k="regular" type="number" step=".01" value="${x.regular}"></div></label>
<label>Selling Price / Unit<div class="unit"><b>RM</b><input data-i="${i}" data-k="selling" type="number" step=".01" value="${x.selling}"></div></label>
</div><div class="summary"><div><small>Package Revenue / AOV</small><strong>${money(c.revenue)}</strong></div><div><small>Total Product Cost</small><strong>${money(c.product)}</strong></div><div><small>Total Cost</small><strong>${money(c.cost)}</strong></div><div><small>Gross Profit</small><strong>${money(c.gross)}</strong></div></div></div>`}).join("");
$("primaryPackage").innerHTML=S.packages.map((x,i)=>`<option value="${i}" ${i===S.primary?"selected":""}>${esc(x.name||"Package "+(i+1))}</option>`).join("");
update();
}
function update(){
let x=S.packages[S.primary],c=calc(x),target=c.gross*p(S.profit),cpp=Math.max(0,c.gross-target),mult=S.tax?1+p(S.taxRate):1,cppTax=cpp*mult,roas=cppTax?c.revenue/cppTax:0;
$("grossProfit").textContent=money(c.gross);$("targetNet").textContent=money(target);$("cpp").textContent=money(cpp);$("cppTax").textContent=money(cppTax);$("roas").textContent=roas?roas.toFixed(2)+"x":"—";$("margin").textContent=(c.margin*100).toFixed(2)+"%";
let ids=["reqNet","reqOrders","reqRevenue","reqSpend","marketer","business","dRevenue","dOrders","dSpend","dCommission","dBusiness"];
if(!S.commission){ids.forEach(i=>$(i).textContent="—");return}
let cp=p(S.commissionPct);if(!cp){ids.forEach(i=>$(i).textContent="—");return}
let req=n(S.targetCommission)/cp, orders=target>0?req/target:0, revenue=orders*c.revenue, spend=orders*cppTax, marketer=n(S.targetCommission),business=req-marketer;
$("reqNet").textContent=money(req);$("reqOrders").textContent=orders?orders.toFixed(2):"—";$("reqRevenue").textContent=money(revenue);$("reqSpend").textContent=money(spend);$("marketer").textContent=money(marketer);$("business").textContent=money(business);
$("dRevenue").textContent=money(revenue/30);$("dOrders").textContent=orders?(orders/30).toFixed(2):"—";$("dSpend").textContent=money(spend/30);$("dCommission").textContent=money(marketer/30);$("dBusiness").textContent=money(business/30);
}
function setProfit(v){S.profit=n(v);document.querySelectorAll("#presets button").forEach(b=>b.classList.toggle("active",b.dataset.v==v));$("customWrap").classList.toggle("hidden",v!=="custom")}
[0,20,30,40,50].forEach(v=>{let b=document.createElement("button");b.textContent=v+"%";b.dataset.v=v;b.onclick=()=>setProfit(v);$("presets").appendChild(b)});
let cb=document.createElement("button");cb.textContent="Custom";cb.dataset.v="custom";cb.onclick=()=>{setProfit("custom");S.profit=n($("customProfit").value);update()};$("presets").appendChild(cb);setProfit(40);
$("customProfit").oninput=e=>{S.profit=n(e.target.value);update()};
$("packages").addEventListener("input",e=>{let i=e.target.dataset.i,k=e.target.dataset.k;if(i===undefined)return;S.packages[i][k]=["name","shippingType"].includes(k)?e.target.value:n(e.target.value);render()});
$("packages").addEventListener("change",e=>{let i=e.target.dataset.i,k=e.target.dataset.k;if(i===undefined)return;S.packages[i][k]=["name","shippingType"].includes(k)?e.target.value:n(e.target.value);render()});
$("packages").addEventListener("click",e=>{if(e.target.dataset.dup!==undefined){let i=+e.target.dataset.dup;S.packages.splice(i+1,0,{...S.packages[i],name:S.packages[i].name+" Copy"});if(S.primary>i)S.primary++;render()}if(e.target.dataset.rem!==undefined){let i=+e.target.dataset.rem;S.packages.splice(i,1);S.primary=Math.min(S.primary,S.packages.length-1);render()}});
$("addPackage").onclick=()=>{S.packages.push({...S.packages[S.packages.length-1],name:"Package "+(S.packages.length+1)});render()};
$("primaryPackage").onchange=e=>{S.primary=+e.target.value;update()};
$("taxEnabled").onchange=e=>{S.tax=e.target.checked;update()};$("taxRate").oninput=e=>{S.taxRate=n(e.target.value);update()};
$("commissionEnabled").onchange=e=>{S.commission=e.target.checked;$("commissionFields").classList.toggle("hidden",!S.commission);update()};
$("commissionPct").oninput=e=>{S.commissionPct=n(e.target.value);update()};$("targetCommission").oninput=e=>{S.targetCommission=n(e.target.value);update()};
render();