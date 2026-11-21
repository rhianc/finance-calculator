load('js/taxes.js');
load('js/model.js');
load('js/markets.js');
load('js/rental-model.js');

var M = FinanceModel;
var failed = 0;

function check(name, cond) {
  if (cond) {
    print('ok  ' + name);
  } else {
    failed += 1;
    print('FAIL ' + name);
  }
}

function near(name, actual, expected, tol) {
  var ok = Math.abs(actual - expected) <= tol;
  if (!ok) print('     got ' + actual + ' expected ' + expected);
  check(name, ok);
}

function base(overrides) {
  var input = {
    price: 0,
    downPayment: 0,
    annualRate: 0,
    years: 30,
    horizonYears: 30,
    propertyTaxRate: 0,
    taxGrowth: 'market',
    insuranceYear: 0,
    maintenanceRate: 0,
    hoaMonth: 0,
    pmiRate: 0,
    closingCostRate: 0,
    sellingCostRate: 0,
    homeAppreciation: 0,
    stockReturn: 0,
    investmentDrag: 0,
    inflation: 0,
    rentMonth: 0,
    filingStatus: 'mfj',
    federalRate: 0,
    stateRate: 0,
    ltcgRate: 0,
    otherSalt: 0,
    otherItemized: 0,
    magi: null
  };
  var key;
  for (key in overrides) input[key] = overrides[key];
  return input;
}

near('30-year 6% payment', M.mortgagePayment(200000, 0.06, 30), 1199.1010503055, 0.001);
near('15-year 5% payment', M.mortgagePayment(100000, 0.05, 15), 790.7936267415, 0.001);
near('zero rate payment', M.mortgagePayment(120000, 0, 10), 1000, 0.001);

var amort = M.project(base({
  price: 200000,
  downPayment: 0,
  annualRate: 0.06,
  years: 30,
  horizonYears: 30
}));
near('first month interest', amort.first.interest, 1000, 0.001);
near('first month principal', amort.first.principal, 199.1010503055, 0.001);
near('balance at 12 months', amort.points[12].balance, M.balanceAfter(200000, 0.06, 30, 12), 0.05);
near('balance at 120 months', amort.points[120].balance, M.balanceAfter(200000, 0.06, 30, 120), 0.05);
near('balance at payoff', amort.points[360].balance, 0, 0.05);

var conserved = M.project(base({
  price: 100000,
  downPayment: 20000,
  years: 10,
  horizonYears: 10
}));
near('zero-rate paths meet', conserved.points[120].houseReal, 100000, 0.05);
near('zero-rate renter meets price', conserved.points[120].rentReal, 100000, 0.05);

var sellOnly = M.project(base({
  price: 100000,
  downPayment: 20000,
  years: 10,
  horizonYears: 10,
  sellingCostRate: 0.06
}));
near('selling cost stays on the house', sellOnly.points[120].houseReal, 94000, 0.05);
near('renter keeps the full price', sellOnly.points[120].rentReal, 100000, 0.05);

near('full salt cap', M.saltCapAmount(null), 40400, 0.01);
near('salt cap at threshold', M.saltCapAmount(505000), 40400, 0.01);
near('salt cap mid phaseout', M.saltCapAmount(550000), 26900, 0.01);
near('salt cap floor', M.saltCapAmount(700000), 10000, 0.01);

var taxCase = M.project(base({
  price: 1000000,
  downPayment: 1000000,
  years: 1,
  horizonYears: 1,
  propertyTaxRate: 0.10,
  federalRate: 0.10,
  filingStatus: 'mfj'
}));
near('first year federal savings', taxCase.totals.firstYearFederal, 820, 0.05);
near('owner keeps house plus savings', taxCase.points[12].houseNominal, 1000820, 0.5);
near('renter is credited the full tax bill', taxCase.points[12].rentNominal, 1100000, 0.5);
near('deduction is not double counted', taxCase.points[12].houseNominal - taxCase.points[12].rentNominal, -99180, 0.5);

var capCase = M.project(base({
  price: 1000000,
  downPayment: 0,
  annualRate: 0.12,
  years: 30,
  horizonYears: 1,
  federalRate: 0,
  stateRate: 0
}));
near('interest above the debt cap is trimmed', capCase.first.deductibleInterest, 7500, 0.01);
near('deductible fraction', capCase.first.interestFraction, 0.75, 0.0001);

var hurdle = M.project(base({
  price: 200000,
  downPayment: 40000,
  annualRate: 0.06,
  years: 30,
  horizonYears: 1,
  propertyTaxRate: 0.01,
  federalRate: 0.24,
  stateRate: 0.093,
  filingStatus: 'mfj'
}));
check('small loan does not clear the standard deduction in month 1', hurdle.first.federalSavings === 0);
check('state savings still apply to deductible interest', hurdle.first.stateSavings > 0);

var ca = base({
  price: 500000,
  propertyTaxRate: 0.011,
  taxGrowth: 'prop13',
  inflation: 0.03,
  homeAppreciation: 0.10
});
near('prop 13 ignores a hot market', M.annualPropertyTax(ca, 1), 500000 * 0.011 * 1.02, 0.01);
var market = base({
  price: 500000,
  propertyTaxRate: 0.011,
  taxGrowth: 'market',
  inflation: 0.03,
  homeAppreciation: 0.10
});
near('market tax tracks appreciation', M.annualPropertyTax(market, 1), 500000 * 0.011 * 1.10, 0.01);
var mild = base({
  price: 500000,
  propertyTaxRate: 0.011,
  taxGrowth: 'prop13',
  inflation: 0.01,
  homeAppreciation: 0.10
});
near('prop 13 uses inflation when it is under 2%', M.annualPropertyTax(mild, 1), 500000 * 0.011 * 1.01, 0.01);

var inflated = M.project(base({
  price: 100,
  downPayment: 100,
  years: 1,
  horizonYears: 1.25,
  rentMonth: 100,
  inflation: 0.10
}));
near('rent steps up on the anniversary', inflated.points[15].houseNominal - inflated.points[15].rentNominal, 12 * 100 + 3 * 110, 0.01);
near('when renting costs more, the owner invests the difference', inflated.points[15].taxPortfolio, 12 * 100 + 3 * 110, 0.01);
near('and the renter never draws the account down', inflated.points[15].rentNominal, 100, 0.01);

var gains = M.project(base({
  price: 300000,
  downPayment: 300000,
  years: 1,
  horizonYears: 2,
  homeAppreciation: 0.5,
  filingStatus: 'single',
  federalRate: 0.24,
  ltcgRate: 0.15,
  stateRate: 0
}));
var g12 = 300000 * Math.pow(1.5, 1) - 300000;
var g24 = 300000 * Math.pow(1.5, 2) - 300000;
near('exactly one year is still short-term', gains.points[12].gainsTax, g12 * 0.24, 0.05);
var g13 = gains.points[13].home - 300000;
near('a year and a month is long-term, no exclusion yet', gains.points[13].gainsTax, g13 * 0.15, 0.05);
near('exclusion applies at 24 months', gains.points[24].gainsTax, (g24 - 250000) * 0.15, 0.05);
near('month 6 is taxed as ordinary income', gains.points[6].gainsTax, (gains.points[6].home - 300000) * 0.24, 0.05);
check('month 23 still has no exclusion', gains.points[23].gainsTax > gains.points[24].gainsTax);

var pmi = M.project(base({
  price: 100000,
  downPayment: 5000,
  annualRate: 0.06,
  years: 30,
  horizonYears: 30,
  homeAppreciation: 0.50,
  pmiRate: 0.006
}));
near('pmi uses the original loan', pmi.first.pmi, 95000 * 0.006 / 12, 0.001);
check('appreciation does not cancel pmi', pmi.totals.pmiMonths > 12);

var manualBalance = 95000;
var manualStop = null;
var manualRate = 0.06 / 12;
var manualPay = M.mortgagePayment(95000, 0.06, 30);
for (var month = 1; month <= 360; month++) {
  if (manualBalance <= 80000 && manualStop == null) manualStop = month;
  var manualInterest = manualBalance * manualRate;
  manualBalance = Math.max(0, manualBalance - (manualPay - manualInterest));
}
near('pmi stops at 80% of the purchase price', pmi.totals.pmiStopMonth, manualStop, 0);

var noPmi = M.project(base({
  price: 100000,
  downPayment: 20000,
  annualRate: 0.065,
  pmiRate: 0.006,
  horizonYears: 1,
  years: 30
}));
near('20% down skips pmi', noPmi.first.pmi, 0, 0.001);

var scaled = M.atPrice(base({
  price: 1000000,
  downPayment: 200000,
  insuranceYear: 5000,
  hoaMonth: 400,
  rentMonth: 3000
}), 500000);
near('down payment percent is preserved', scaled.downPayment, 100000, 0.01);
near('insurance scales with price', scaled.insuranceYear, 2500, 0.01);
near('rent stays put in the price sweep', scaled.rentMonth, 3000, 0.01);
near('hoa stays put in the price sweep', scaled.hoaMonth, 400, 0.01);

var real = M.project(base({
  price: 100000,
  downPayment: 100000,
  horizonYears: 1,
  years: 1,
  inflation: 0.10
}));
near('inflation restates a flat portfolio', real.points[12].houseReal, 100000 / 1.10, 0.05);

var drag = M.project(base({
  price: 100000,
  downPayment: 100000,
  horizonYears: 1,
  years: 1,
  stockReturn: 0.10,
  investmentDrag: 0.01,
  sellingCostRate: 0
}));
var undragged = M.project(base({
  price: 100000,
  downPayment: 100000,
  horizonYears: 1,
  years: 1,
  stockReturn: 0.10
}));
check('drag lowers the renter portfolio', drag.points[12].rentNominal < undragged.points[12].rentNominal - 1);

near('typical return is the mean less the drag', M.typicalReturn(0.09, 0.16), 1.09 * Math.exp(-0.0128) - 1, 1e-12);
near('no volatility, no drag', M.typicalReturn(0.09, 0), 0.09, 1e-12);

var volCase = M.project(base({
  price: 100000, downPayment: 100000, years: 1, horizonYears: 1, stockReturn: 0.09, stockVol: 0.16
}));
near('the renter compounds at the typical rate', volCase.points[12].rentPortfolio, 100000 * 1.09 * Math.exp(-0.0128), 0.5);

var stockTax = M.project(base({
  price: 100000, downPayment: 100000, years: 2, horizonYears: 2, stockReturn: 0.10,
  ltcgRate: 0.15, stateRate: 0.05, federalRate: 0.3
}));
var grown = 100000 * 1.21;
near('the renter pays gains tax when the account is sold', stockTax.points[24].rentNominal, grown - (grown - 100000) * 0.20, 0.5);
near('short-term stock gains are ordinary', stockTax.points[6].renterStockTax, (stockTax.points[6].rentPortfolio - 100000) * 0.35, 0.01);

var caCap = M.project(base({
  price: 1250000, downPayment: 0, annualRate: 0.06, years: 30, horizonYears: 1,
  income: 400000, stateCode: 'CA', filingStatus: 'mfj'
}));
near('California deducts interest on up to $1,000,000', caCap.first.stateDeductibleInterest, 1250000 * 0.005 * 0.8, 0.01);
near('the federal return stops at $750,000', caCap.first.deductibleInterest, 1250000 * 0.005 * 0.6, 0.01);

var grows = M.project(base({ price: 100, downPayment: 100, years: 1, horizonYears: 2, rentMonth: 100, inflation: 0.02, rentGrowth: 0.05 }));
near('rent follows its own growth rate', grows.points[13].houseNominal - grows.points[12].houseNominal, 105, 0.01);

var uc = M.project(base({
  price: 800000, downPayment: 160000, annualRate: 0.0625, horizonYears: 7, propertyTaxRate: 0.011,
  maintenanceRate: 0.01, insuranceYear: 3200, homeAppreciation: 0.035, stockReturn: 0.06,
  closingCostRate: 0.02, sellingCostRate: 0.06, rentMonth: 3400
}));
near('user cost matches the companion house', uc.userCost.u, 0.06 + 0.011 + 0.01 + 0.004 - 0.035 + 0.08 / 7, 1e-9);
near('rent yield is a year of rent over price', uc.userCost.rentYield, 0.051, 1e-9);

var H = HomeMarkets;
near('U.S. appreciation since 1991', H.place('US', '').rate, 4.26, 0.001);
near('California statewide appreciation', H.place('CA', '').rate, 4.14, 0.001);
near('Los Angeles appreciation', H.place('CA', '31084').rate, 4.33, 0.001);
near('San Jose appreciation', H.place('CA', '41940').rate, 4.91, 0.001);
check('Los Angeles ran ahead of Bakersfield', H.place('CA', '31084').rate > H.place('CA', '12540').rate);
check('an unknown city falls back to the state', H.place('CA', 'nope').kind === 'state');
check('Montana has no top-100 city', H.cities('MT').length === 0);
check('Texas includes Austin', H.cities('TX').some(function (city) { return city.name === 'Austin' && city.rate === 5.59; }));
var opts = H.options();
check('new California purchase stays first', opts[0].id === 'CA' && opts[0].taxRate === 1.10 && opts[0].taxGrowth === 'prop13');
check('California effective rate is unchanged', opts[1].id === 'CA-eff' && opts[1].taxRate === 0.71);
check('New Jersey tax preset is unchanged', opts.some(function (opt) { return opt.id === 'NJ' && opt.taxRate === 2.23; }));
near('California insurance at $300k dwelling', H.STATES.CA.ins, 2040, 0.01);
near('U.S. insurance at $300k dwelling', H.STATES.US.ins, 2808, 0.01);
near('Los Angeles insurance is its own figure', H.place('CA', '31084').ins, 2400, 0.01);
check('Los Angeles insurance is tagged as a city figure', H.place('CA', '31084').insFrom === 'city');
check('Oakland falls back to the California premium', H.place('CA', '36084').ins === 2040 && H.place('CA', '36084').insFrom === 'state');
check('Miami costs more than Jacksonville at the same coverage', H.place('FL', '33124').ins > H.place('FL', '27260').ins);
check('a $1,000,000 California home scales the $300,000 premium', Math.round(1000000 * H.place('CA', '').ins / H.DWELLING) === 6800);
check('New Orleans uses the October 2026 city premium', H.place('LA', '35380').ins === 8388);
check('Oklahoma City uses the October 2026 city premium', H.place('OK', '36420').ins === 6228);
check('Ventura uses the Oxnard premium', H.place('CA', '37100').ins === 1920 && H.place('CA', '37100').insFrom === 'city');
check('every listed city has a finite rate', Object.keys(H.CITIES).every(function (code) {
  return H.CITIES[code].every(function (city) { return city.rate > 0 && city.rate < 12; });
}));

var T = TaxRules;
near('2026 joint tax on $217,800 taxable', T.ordinaryTax('mfj', 217800), 37468, 0.01);
near('that income is the 24% bracket', T.federalMarginal('mfj', 217800), 0.24, 0.0001);
near('California marginal rate at $250,000', T.stateMarginal('CA', 'mfj', 250000, ''), 0.093, 0.0001);
near('California tax at $250,000 joint, 2026 schedule', T.saltBill('CA', 'mfj', 250000, ''), 14471.72, 1);
near('Texas has no income tax', T.saltBill('TX', 'mfj', 250000, ''), 0, 0.01);
near('a dollar of California itemized deductions past the standard saves 9.3 cents', T.stateIncomeTax('CA', 'mfj', 250000, 20000, '') - T.stateIncomeTax('CA', 'mfj', 250000, 20001, ''), 0.093, 0.0001);
near('itemizing below the California standard deduction saves nothing', T.stateIncomeTax('CA', 'mfj', 250000, 0, '') - T.stateIncomeTax('CA', 'mfj', 250000, 11000, ''), 0, 0.0001);
near('Illinois allows no mortgage interest', T.stateIncomeTax('IL', 'mfj', 250000, 0, '', 0) - T.stateIncomeTax('IL', 'mfj', 250000, 30000, '', 30000), 0, 0.0001);
near('North Carolina caps home deductions at $20,000', T.stateIncomeTax('NC', 'mfj', 250000, 0, '', 0) - T.stateIncomeTax('NC', 'mfj', 250000, 40000, '', 40000), (20000 - 25500 > 0 ? 0 : 0) , 0.0001);
near('Utah: a mortgage moves the credit, and at $300,000 the credit is gone', T.stateIncomeTax('UT', 'mfj', 300000, 0, '') - T.stateIncomeTax('UT', 'mfj', 300000, 40000, ''), 0, 0.0001);
near('Utah at $60,000: 6% of the deductions past the standard', T.stateIncomeTax('UT', 'mfj', 60000, 0, '') - T.stateIncomeTax('UT', 'mfj', 60000, 40000, ''), 0.06 * (40000 - 32200), 0.01);
near('Georgia 2026 is 4.99% past a $30,000 joint deduction', T.stateIncomeTax('GA', 'mfj', 130000, 0, ''), 100000 * 0.0499, 0.01);
near('long-term gain at the NIIT threshold', T.taxOnGain({
  income: 250000, status: 'mfj', state: 'TX', city: '', taxableGain: 100000, longTerm: true
}), 18800, 0.05);
near('only the gain above $250,000 owes NIIT', T.taxOnGain({
  income: 200000, status: 'mfj', state: 'TX', city: '', taxableGain: 100000, longTerm: true
}), 16900, 0.05);
near('a large gain reaches the 20% band', T.taxOnGain({
  income: 250000, status: 'mfj', state: 'TX', city: '', taxableGain: 500000, longTerm: true
}), 99205, 0.05);
near('SALT cap in 2026', T.saltCapForYear(0, 250000), 40400, 0.01);
near('SALT cap returns to $10,000 in 2030', T.saltCapForYear(4, 250000), 10000, 0.01);
check('New York City tax exceeds the statewide average', T.saltBill('NY', 'mfj', 250000, 'New York') > T.saltBill('NY', 'mfj', 250000, '') + 1000);

var bracketed = M.project(base({
  price: 1000000,
  downPayment: 1000000,
  years: 1,
  horizonYears: 5,
  propertyTaxRate: 0.05,
  taxGrowth: 'market',
  homeAppreciation: 0,
  stockReturn: 0,
  inflation: 0,
  income: 200000,
  stateCode: 'TX',
  filingStatus: 'mfj',
  otherSalt: 0
}));
near('brackets, not a flat rate, price the federal savings', bracketed.points[12].taxPortfolio, 1804, 0.05);
near('no federal savings once the SALT cap falls to $10,000', bracketed.points[60].taxPortfolio - bracketed.points[48].taxPortfolio, 0, 0.05);

var kept = M.atPrice(base({
  price: 1000000,
  downPayment: 200000,
  income: 250000,
  stateCode: 'CA',
  cityName: 'Los Angeles'
}), 500000);
check('income stays put as the price changes', kept.income === 250000 && kept.stateCode === 'CA' && kept.cityName === 'Los Angeles');

var RM = RentalModel;
var tx = { filingStatus: 'mfj', income: 200000, stateCode: 'TX', cityName: '' };
var freed = RM.saleTax(tx, 0, 100000, 50000, true).tax - RM.saleTax(tx, 0, 100000, 0, true).tax;
near('freed passive losses come off wages at 22%, and pull the gain under the NIIT line', freed, -50000 * 0.22 - 50000 * 0.038, 0.5);
near('depreciation recapture is capped at 25%', RM.saleTax({ filingStatus: 'mfj', income: 700000, stateCode: 'TX', cityName: '' }, 100000, 0, 0, true).tax, 25000 + 3800, 0.5);
var lowU = RM.saleTax({ filingStatus: 'mfj', income: 100000, stateCode: 'TX', cityName: '' }, 10000, 0, 0, true).tax;
near('recapture under 25% is taxed at the bracket it lands in', lowU, 10000 * 0.12, 0.5);
var rentalBase = {
  price: 400000, downPayment: 100000, annualRate: 0.06, years: 30, horizonYears: 3, propertyTaxRate: 0.01,
  insuranceYear: 1500, maintenanceRate: 0.01, homeAppreciation: 0.04, stockReturn: 0.09, stockVol: 0.16,
  inflation: 0.025, rentGrowth: 0.04, rentMonth: 2600, vacancyRate: 0.05, managementRate: 0.08,
  closingCostRate: 0.02, sellingCostRate: 0.06, filingStatus: 'mfj', income: 200000, stateCode: 'TX'
};
var rp = RM.project(rentalBase);
check('the stock alternative pays tax on its gain when sold', rp.points[36].stockTax > 0 && rp.points[36].stockNominal < rp.points[36].stock);
near('rental stocks compound at the typical rate', rp.stockTypical, 1.09 * Math.exp(-0.0128) - 1, 1e-12);
near('rental rent grows at its own rate', rp.points[13].rent / rp.points[12].rent, 1.04, 1e-9);

var keepBase = {
  price: 1500000, downPayment: 300000, annualRate: 0.065, years: 30, horizonYears: 30, propertyTaxRate: 0.011,
  taxGrowth: 'prop13', insuranceYear: 6100, maintenanceRate: 0.01, closingCostRate: 0.02, sellingCostRate: 0.06,
  homeAppreciation: 0.035, inflation: 0.025, rentMonth: 4500, rentGrowth: 0.035, stockReturn: 0.09, stockVol: 0.16,
  filingStatus: 'mfj', income: 300000, stateCode: 'CA', cityName: ''
};
var sold = FinanceModel.project(keepBase);
var kept = FinanceModel.project(Object.assign({}, keepBase, { exit: 'keep' }));
var sEnd = sold.points[sold.points.length - 1];
var kEnd = kept.points[kept.points.length - 1];
check('keeping pays no tax on either side', kEnd.gainsTax === 0 && kEnd.renterStockTax === 0 && kEnd.ownerStockTax === 0);
near('kept house is market value less the loan plus the owner account', kEnd.houseNominal, kEnd.home - kEnd.balance + kEnd.taxPortfolio, 1e-6);
near('kept renter side is the whole portfolio', kEnd.rentNominal, kEnd.rentPortfolio, 1e-6);
check('selling taxes the renter portfolio', sEnd.renterStockTax > 0 && sEnd.rentNominal < sEnd.rentPortfolio);
check('keep drops selling costs from user cost', kept.userCost.parts.transactions < sold.userCost.parts.transactions);
check('exit defaults to sell', FinanceModel.normalize({}).exit === 'sell');

var MK = HomeMarkets;
check('LA metro rents use the LA index', MK.place('CA', '31084').rentCpi.name === 'Los Angeles');
check('San Jose uses the Bay Area index', MK.place('CA', '41940').rentCpi.name === 'the Bay Area');
check('California statewide uses the West', MK.place('CA', '').rentCpi.name === 'the West');
check('Texas statewide uses the South', MK.place('TX', '').rentCpi.name === 'the South');

check('California land share is FHFA 2022', Math.abs(HomeMarkets.place('CA', '').landShare - 0.58) < 1e-9);
check('San Jose land share is its own metro', Math.abs(HomeMarkets.place('CA', '41940').landShare - 0.684) < 1e-9);
var rKeep = RM.project(Object.assign({}, rentalBase, { horizonYears: 10, exit: 'keep' }));
var rSell = RM.project(Object.assign({}, rentalBase, { horizonYears: 10 }));
var rk = rKeep.points[rKeep.points.length - 1];
var rs = rSell.points[rSell.points.length - 1];
check('kept rental pays no sale or stock tax', rk.saleTax === 0 && rk.sideTax === 0 && rk.stockTax === 0);
near('kept rental is market value less loan plus side account', rk.rentalNominal, rk.home - rk.balance + rk.side, 1e-6);
check('selling the rental costs more than keeping it', rs.rentalNominal < rk.rentalNominal);

if (failed) {
  print(failed + ' failed');
  quit(1);
}
print('all passed');
