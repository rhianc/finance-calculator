load('js/model.js');

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
near('rent steps up on the anniversary', inflated.points[15].rentNominal, 100 - 12 * 100 - 3 * 110, 0.01);

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
near('short of two years, no exclusion', gains.points[12].gainsTax, g12 * 0.15, 0.05);
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

if (failed) {
  print(failed + ' failed');
  quit(1);
}
print('all passed');
