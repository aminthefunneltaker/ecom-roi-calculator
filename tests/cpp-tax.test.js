const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function makeElement(id){
  return {
    id,
    value: id === 'taxRate' ? '8' : id === 'customProfit' ? '40' : id === 'requiredNet' ? '10000' : '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    checked: false,
    classList: { toggle(){}, add(){}, remove(){} },
    appendChild(){},
    addEventListener(){},
    querySelectorAll(){ return []; },
    setSelectionRange(){},
    dataset: {}
  };
}

const elements = new Map();
const ids = [
  'packageTable','primaryPackage','targetNetProfit','cppExTax','cppIncTax','roasExTax','roasIncTax','roi',
  'requiredNet','requiredNetHint','requiredNetWrap','businessShareWrap','reqOrders','reqSales','reqAdsEx','reqAdsInc',
  'businessShare','dailySales','dailyOrders','dailyAdsEx','dailyAdsInc','customProfitWrap','profitPresets','customProfit',
  'addPackage','taxRate','commissionEnabled','commissionFields','commissionPct','targetCommission','currentPackageTable',
  'currentAdsSpend','currentOrders','currentAov','currentRevenue','currentCogs','currentGrossProfit','currentCpp','currentRoas',
  'currentRoi','currentNetProfit'
];
ids.forEach(id => elements.set(id, makeElement(id)));

const sandbox = {
  console,
  document: {
    getElementById(id){
      if(!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement(){ return makeElement('created'); },
    querySelectorAll(){ return []; }
  }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('script.js', 'utf8') + '\nthis.__api = { S, updateProfitability };', sandbox);
const { S, updateProfitability } = sandbox.__api;

S.packages = [{
  name: 'TRIAL PEK',
  skus: [{name: 'SKU', qty: 1, productCost: 10.1}],
  shippingCost: 0,
  shippingCharge: 0,
  freeShip: true,
  regular: 40,
  selling: 24.9,
  currentOrders: 0
}];
S.primary = 0;
S.taxRate = 8;
S.profitPct = 0;
updateProfitability();

assert.strictEqual(elements.get('targetNetProfit').textContent, 'RM0.00');
assert.strictEqual(elements.get('cppIncTax').textContent, 'RM14.80', 'At breakeven, CPP incl. tax should equal gross profit');
assert.strictEqual(elements.get('cppExTax').textContent, 'RM13.70', 'CPP excl. tax should be backed out from incl. tax at 8%');
assert.strictEqual(elements.get('roasIncTax').textContent, '1.68x');
assert.strictEqual(elements.get('roasExTax').textContent, '1.82x');
console.log('cpp tax profitability calculations ok');
