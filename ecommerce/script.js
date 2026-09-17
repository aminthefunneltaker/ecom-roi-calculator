const $ = id => document.getElementById(id);
const money = value => "RM" + (Number(value) || 0).toLocaleString("en-MY", {minimumFractionDigits:2, maximumFractionDigits:2});
const numberValue = value => Math.max(0, Number(String(value ?? "").replace(/,/g, "")) || 0);
const formatNumber = value => Number(value || 0).toLocaleString("en-US", {minimumFractionDigits:0, maximumFractionDigits:2});

const SHIPPING_RATES = {
  peninsular: {seller:7, customer:10},
  sabahsara: {seller:10, customer:14}
};

let rows = [{name:"SKU 1", share:100, price:180, cost:70}];
let profitPct = 20;

function formatInput(input){
  const raw = input.value.replace(/,/g, "");
  if(raw === "") return;
  const parts = raw.split(".");
  const integer = (parts[0].replace(/[^0-9]/g, "") || "0").replace(/^0+(?=\d)/, "");
  const decimal = parts.length > 1 ? "." + parts.slice(1).join("").replace(/[^0-9]/g, "") : "";
  input.value = Number(integer || 0).toLocaleString("en-US") + decimal;
}

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, match => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[match]));
}

function setImportStatus(message, type=""){
  const el = $("importStatus");
  el.textContent = message;
  el.className = "import-status" + (type ? " " + type : "");
}

function csvEscape(value){ return '"' + String(value ?? "").replace(/"/g, '""') + '"'; }

function downloadTemplate(){
  const csv = [
    "Name,Order share,Selling price,Product cost",
    ["SKU 1",100,180,70].map(csvEscape).join(",")
  ].join("\r\n") + "\r\n";
  const blob = new Blob(["\ufeff", csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ecommerce-roi-sku-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  setImportStatus("Template downloaded. Edit it in Excel or Google Sheets, then upload the CSV.", "success");
}

function parseCsv(text){
  const source = String(text).replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const result = [];
  let row = [], cell = "", quoted = false;
  for(let i=0; i<source.length; i++){
    const char = source[i];
    if(char === '"'){
      if(quoted && source[i+1] === '"'){ cell += '"'; i++; }
      else quoted = !quoted;
    }else if(char === delimiter && !quoted){ row.push(cell); cell = ""; }
    else if((char === "\n" || char === "\r") && !quoted){
      if(char === "\r" && source[i+1] === "\n") i++;
      row.push(cell);
      if(row.some(value => value.trim() !== "")) result.push(row);
      row = []; cell = "";
    }else cell += char;
  }
  if(cell !== "" || row.length){ row.push(cell); if(row.some(value => value.trim() !== "")) result.push(row); }
  return result;
}

function headerKey(value){ return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, ""); }

function importedNumber(value, label, rowNumber){
  const raw = String(value ?? "").trim();
  if(raw === "") throw new Error(`Row ${rowNumber}: ${label} is required.`);
  const result = Number(raw.replace(/,/g, "").replace(/^(rm|%)\s*/i, ""));
  if(!Number.isFinite(result) || result < 0) throw new Error(`Row ${rowNumber}: ${label} must be a non-negative number.`);
  return result;
}

function importSkuCsv(text){
  const matrix = parseCsv(text);
  if(matrix.length < 2) throw new Error("The CSV must include the header row and at least one SKU.");
  const headers = matrix[0].map(headerKey);
  const find = aliases => headers.findIndex(header => aliases.includes(header));
  const indexes = {
    name: find(["name","sku","skuname"]),
    share: find(["ordershare","share","ordersharepercent"]),
    price: find(["sellingprice","sellingpricerm","price"]),
    cost: find(["productcost","productcostrm"])
  };
  const missing = Object.entries({name:"Name",share:"Order share",price:"Selling price",cost:"Product cost"})
    .filter(([key]) => indexes[key] < 0).map(([, label]) => label);
  if(missing.length) throw new Error(`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`);

  const imported = [];
  matrix.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    if(cells.every(value => String(value ?? "").trim() === "")) return;
    imported.push({
      name: String(cells[indexes.name] ?? "").trim() || `SKU ${imported.length + 1}`,
      share: importedNumber(cells[indexes.share], "Order share", rowNumber),
      price: importedNumber(cells[indexes.price], "Selling price", rowNumber),
      cost: importedNumber(cells[indexes.cost], "Product cost", rowNumber)
    });
  });
  if(!imported.length) throw new Error("No SKU rows found in the CSV.");
  return imported;
}

async function importSkuFile(file){
  try{
    if(!/\.csv$/i.test(file.name) && file.type && file.type !== "text/csv") throw new Error("Please upload a CSV file downloaded from the template.");
    rows = importSkuCsv(await file.text());
    renderRows();
    setImportStatus(`${rows.length} SKU${rows.length === 1 ? "" : "s"} imported. Total order share: ${formatNumber(rows.reduce((sum, row) => sum + row.share, 0))}%.`, "success");
  }catch(error){ setImportStatus(error.message || "Could not import this CSV.", "error"); }
}

function renderRows(){
  $("skuList").innerHTML = rows.map((row, index) => `
    <div class="sku-row">
      <div class="sku-name">
        <input type="text" aria-label="Name" data-index="${index}" data-key="name" value="${escapeHtml(row.name)}">
        ${rows.length > 1 ? `<button class="remove" type="button" data-index="${index}">Remove</button>` : ""}
      </div>
      <div class="unit"><input type="text" aria-label="Order share" data-index="${index}" data-key="share" value="${row.share}" inputmode="decimal"><b>%</b></div>
      <div class="unit"><b>RM</b><input type="text" aria-label="Selling price" data-index="${index}" data-key="price" value="${row.price}" inputmode="decimal"></div>
      <div class="unit"><b>RM</b><input type="text" aria-label="Product cost" data-index="${index}" data-key="cost" value="${row.cost}" inputmode="decimal"></div>
    </div>`).join("");

  document.querySelectorAll("#skuList input").forEach(input => input.addEventListener("input", event => {
    const target = event.target;
    const row = rows[Number(target.dataset.index)];
    const key = target.dataset.key;
    if(key === "name") row[key] = target.value;
    else { formatInput(target); row[key] = numberValue(target.value); }
    calculate();
  }));
  document.querySelectorAll(".remove").forEach(button => button.addEventListener("click", () => {
    rows.splice(Number(button.dataset.index), 1);
    renderRows();
  }));
  calculate();
}

function applyShippingZone(zone){
  const rates = SHIPPING_RATES[zone] || SHIPPING_RATES.peninsular;
  $("sellerShipping").value = formatNumber(rates.seller);
  $("customerShipping").value = formatNumber(rates.customer);
  calculate();
}

function calculate(){
  const sellerShipping = numberValue($("sellerShipping").value);
  const customerShipping = numberValue($("customerShipping").value);
  const taxRate = numberValue($("tax").value) / 100;
  const totalShare = rows.reduce((sum, row) => sum + row.share, 0);
  const aov = rows.reduce((sum, row) => sum + row.share / 100 * (row.price + customerShipping), 0);
  const grossProfit = rows.reduce((sum, row) => sum + row.share / 100 * (row.price + customerShipping - row.cost - sellerShipping), 0);
  const grossMargin = aov ? grossProfit / aov : 0;
  const targetNet = grossProfit * profitPct / 100;
  const cppInc = grossProfit - targetNet;
  const cppEx = (1 + taxRate) > 0 ? cppInc / (1 + taxRate) : cppInc;
  const roasEx = cppEx > 0 ? aov / cppEx : 0;
  const roasInc = cppInc > 0 ? aov / cppInc : 0;
  const roi = cppInc > 0 ? targetNet / cppInc : 0;
  const requiredNet = numberValue($("profit").value);
  const orders = targetNet > 0 && requiredNet > 0 ? Math.ceil(requiredNet / targetNet) : 0;
  const monthlySales = orders * aov;
  const monthlyAdsEx = orders * cppEx;
  const monthlyAdsInc = orders * cppInc;

  $("shareTotal").textContent = formatNumber(totalShare) + "%";
  $("aovValue").textContent = money(aov);
  $("targetNetProfit").textContent = money(targetNet);
  $("cppExTax").textContent = money(cppEx);
  $("cppIncTax").textContent = money(cppInc);
  $("roasExTax").textContent = roasEx ? roasEx.toFixed(2) + "x" : "—";
  $("roasIncTax").textContent = roasInc ? roasInc.toFixed(2) + "x" : "—";
  $("roi").textContent = roi ? roi.toFixed(2) : "—";

  $("monthlyOrders").textContent = orders ? orders.toLocaleString("en-MY") : "—";
  $("monthlySales").textContent = orders ? money(monthlySales) : "—";
  $("monthlyAdsEx").textContent = orders ? money(monthlyAdsEx) : "—";
  $("monthlyAdsInc").textContent = orders ? money(monthlyAdsInc) : "—";
  $("dailyOrders").textContent = orders ? Math.ceil(orders / 30).toLocaleString("en-MY") : "—";
  $("dailySales").textContent = orders ? money(monthlySales / 30) : "—";
  $("dailyAdsEx").textContent = orders ? money(monthlyAdsEx / 30) : "—";
  $("dailyAdsInc").textContent = orders ? money(monthlyAdsInc / 30) : "—";

  document.body.dataset.grossMargin = String(grossMargin);
}

[0,20,30,40,50].forEach(value => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = value + "%";
  button.dataset.value = value;
  button.addEventListener("click", () => setProfit(value));
  $("profitPresets").appendChild(button);
});
const customButton = document.createElement("button");
customButton.type = "button";
customButton.textContent = "Custom";
customButton.dataset.value = "custom";
customButton.addEventListener("click", () => setProfit("custom"));
$("profitPresets").appendChild(customButton);

function setProfit(value){
  if(value === "custom"){
    $("customProfitWrap").classList.remove("hidden");
    profitPct = numberValue($("customProfit").value);
  }else{
    $("customProfitWrap").classList.add("hidden");
    profitPct = Number(value);
  }
  document.querySelectorAll("#profitPresets button").forEach(button => button.classList.toggle("active", button.dataset.value === String(value)));
  calculate();
}

$("customProfit").addEventListener("input", event => { formatInput(event.target); profitPct = numberValue(event.target.value); calculate(); });
$("tax").addEventListener("input", event => { formatInput(event.target); calculate(); });
$("profit").addEventListener("input", event => { formatInput(event.target); calculate(); });
$("sellerShipping").addEventListener("input", event => { formatInput(event.target); calculate(); });
$("customerShipping").addEventListener("input", event => { formatInput(event.target); calculate(); });
$("shippingZone").addEventListener("change", event => applyShippingZone(event.target.value));
$("addSku").addEventListener("click", () => { rows.push({name:`SKU ${rows.length + 1}`, share:0, price:0, cost:0}); renderRows(); });
$("downloadTemplate").addEventListener("click", downloadTemplate);
$("importSku").addEventListener("click", () => $("skuFile").click());
$("skuFile").addEventListener("change", event => { const file = event.target.files[0]; if(file) importSkuFile(file); event.target.value = ""; });

$("themeToggle").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme === "dark";
  if(dark){ delete document.documentElement.dataset.theme; localStorage.setItem("ecom-roi-theme", "light"); }
  else { document.documentElement.dataset.theme = "dark"; localStorage.setItem("ecom-roi-theme", "dark"); }
  $("themeToggle").setAttribute("aria-pressed", String(!dark));
});

setProfit(20);
renderRows();
