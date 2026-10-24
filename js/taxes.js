(function (root) {
  'use strict';

  // Tax year 2026.
  // Federal brackets and the standard deduction: IRS Rev. Proc. 2025-32.
  // Long-term gain thresholds: Rev. Proc. 2025-32. NIIT thresholds are not indexed (IRC §1411).
  // State brackets: Tax Foundation, "State Individual Income Tax Rates and Brackets, 2026"
  // (rates as of January 1, 2026). Two adults, no dependents.
  var FED_STD = { single: 16100, mfj: 32200 };
  var FED = {
    single: [[0, 0.10], [12400, 0.12], [50400, 0.22], [105700, 0.24], [201775, 0.32], [256225, 0.35], [640600, 0.37]],
    mfj: [[0, 0.10], [24800, 0.12], [100800, 0.22], [211400, 0.24], [403550, 0.32], [512450, 0.35], [768700, 0.37]]
  };
  var LTCG = {
    single: [[0, 0], [49450, 0.15], [545500, 0.20]],
    mfj: [[0, 0], [98900, 0.15], [613700, 0.20]]
  };
  var NIIT_THRESHOLD = { single: 200000, mfj: 250000 };
  var NIIT_RATE = 0.038;

  // New York City resident tax. Brackets have not been inflation-indexed.
  var NYC = {
    single: [[0, 0.03078], [12000, 0.03762], [25000, 0.03819], [50000, 0.03876]],
    mfj: [[0, 0.03078], [21600, 0.03762], [45000, 0.03819], [90000, 0.03876]]
  };

  // Local earned-income taxes, as a share of AGI. They use up the SALT cap.
  // They are not charged on a home sale, and mortgage interest does not reduce them.
  // New York's 1.6% is the statewide average and is not added on top of New York City tax.
  // Philadelphia's resident wage tax replaces Pennsylvania's 0.99% average.
  var WAGE_LOCAL = { KY: 0.0093, OH: 0.012, PA: 0.0099, NY: 0.016 };
  var PHILLY_WAGE = 0.0374;

  var STATES = {AL:{single:{ded:2500,exempt:1500,credit:0,brackets:[[0,0.02],[500,0.04],[3000,0.05]]},mfj:{ded:5000,exempt:3000,credit:0,brackets:[[0,0.02],[1000,0.04],[6000,0.05]]}},AR:{single:{ded:2470,exempt:0,credit:29,brackets:[[0,0.02],[4600,0.039]]},mfj:{ded:4940,exempt:0,credit:58,brackets:[[0,0.02],[4600,0.039]]}},AZ:{single:{ded:8350,exempt:0,credit:0,brackets:[[0,0.025]]},mfj:{ded:16700,exempt:0,credit:0,brackets:[[0,0.025]]}},CA:{single:{ded:5540,exempt:0,credit:153,brackets:[[0,0.01],[11079,0.02],[26264,0.04],[41452,0.06],[57542,0.08],[72724,0.093],[371479,0.103],[445771,0.113],[742953,0.123],[1000000,0.133]]},mfj:{ded:11080,exempt:0,credit:306,brackets:[[0,0.01],[22158,0.02],[52528,0.04],[82904,0.06],[115084,0.08],[145448,0.093],[742958,0.103],[891542,0.113],[1000000,0.123],[1485906,0.133]]}},CO:{single:{ded:16100,exempt:0,credit:0,brackets:[[0,0.044]]},mfj:{ded:32200,exempt:0,credit:0,brackets:[[0,0.044]]}},CT:{single:{ded:0,exempt:15000,credit:0,brackets:[[0,0.02],[10000,0.045],[50000,0.055],[100000,0.06],[200000,0.065],[250000,0.069],[500000,0.0699]]},mfj:{ded:0,exempt:24000,credit:0,brackets:[[0,0.02],[20000,0.045],[100000,0.055],[200000,0.06],[400000,0.065],[500000,0.069],[1000000,0.0699]]}},DC:{single:{ded:16100,exempt:0,credit:0,brackets:[[0,0.04],[10000,0.06],[40000,0.065],[60000,0.085],[250000,0.0925],[500000,0.0975],[1000000,0.1075]]},mfj:{ded:32200,exempt:0,credit:0,brackets:[[0,0.04],[10000,0.06],[40000,0.065],[60000,0.085],[250000,0.0925],[500000,0.0975],[1000000,0.1075]]}},DE:{single:{ded:3250,exempt:0,credit:110,brackets:[[2000,0.022],[5000,0.039],[10000,0.048],[20000,0.052],[25000,0.0555],[60000,0.066]]},mfj:{ded:6500,exempt:0,credit:220,brackets:[[2000,0.022],[5000,0.039],[10000,0.048],[20000,0.052],[25000,0.0555],[60000,0.066]]}},GA:{single:{ded:12000,exempt:0,credit:0,brackets:[[0,0.0519]]},mfj:{ded:24000,exempt:0,credit:0,brackets:[[0,0.0519]]}},HI:{single:{ded:4400,exempt:1144,credit:0,brackets:[[0,0.014],[9600,0.032],[14400,0.055],[19200,0.064],[24000,0.068],[36000,0.072],[48000,0.076],[125000,0.079],[175000,0.0825],[225000,0.09],[275000,0.1],[325000,0.11]]},mfj:{ded:8800,exempt:2288,credit:0,brackets:[[0,0.014],[19200,0.032],[28800,0.055],[38400,0.064],[48000,0.068],[72000,0.072],[96000,0.076],[250000,0.079],[350000,0.0825],[450000,0.09],[550000,0.1],[650000,0.11]]}},IA:{single:{ded:16100,exempt:0,credit:40,brackets:[[0,0.038]]},mfj:{ded:32200,exempt:0,credit:80,brackets:[[0,0.038]]}},ID:{single:{ded:16100,exempt:0,credit:0,brackets:[[4811,0.053]]},mfj:{ded:32200,exempt:0,credit:0,brackets:[[9622,0.053]]}},IL:{single:{ded:0,exempt:2925,credit:0,brackets:[[0,0.0495]]},mfj:{ded:0,exempt:5850,credit:0,brackets:[[0,0.0495]]}},IN:{single:{ded:0,exempt:1000,credit:0,brackets:[[0,0.0295]]},mfj:{ded:0,exempt:2000,credit:0,brackets:[[0,0.0295]]}},KS:{single:{ded:3605,exempt:9160,credit:0,brackets:[[0,0.052],[23000,0.0558]]},mfj:{ded:8240,exempt:18320,credit:0,brackets:[[0,0.052],[46000,0.0558]]}},KY:{single:{ded:3360,exempt:0,credit:0,brackets:[[0,0.035]]},mfj:{ded:3360,exempt:0,credit:0,brackets:[[0,0.035]]}},LA:{single:{ded:12875,exempt:0,credit:0,brackets:[[0,0.03]]},mfj:{ded:25750,exempt:0,credit:0,brackets:[[0,0.03]]}},MA:{single:{ded:0,exempt:4400,credit:0,brackets:[[0,0.05],[1083150,0.09]]},mfj:{ded:0,exempt:8800,credit:0,brackets:[[0,0.05],[1083150,0.09]]}},MD:{single:{ded:3350,exempt:3200,credit:0,brackets:[[0,0.02],[1000,0.03],[2000,0.04],[3000,0.0475],[100000,0.05],[125000,0.0525],[150000,0.055],[250000,0.0575],[500000,0.0625],[1000000,0.065]]},mfj:{ded:6700,exempt:6400,credit:0,brackets:[[0,0.02],[1000,0.03],[2000,0.04],[3000,0.0475],[150000,0.05],[175000,0.0525],[225000,0.055],[300000,0.0575],[600000,0.0625],[1200000,0.065]]}},ME:{single:{ded:8350,exempt:5300,credit:0,brackets:[[0,0.058],[27399,0.0675],[64849,0.0715]]},mfj:{ded:16700,exempt:10600,credit:0,brackets:[[0,0.058],[54849,0.0675],[129749,0.0715]]}},MI:{single:{ded:0,exempt:5900,credit:0,brackets:[[0,0.0425]]},mfj:{ded:0,exempt:11800,credit:0,brackets:[[0,0.0425]]}},MN:{single:{ded:15300,exempt:0,credit:0,brackets:[[0,0.0535],[33310,0.068],[109430,0.0785],[203150,0.0985]]},mfj:{ded:30600,exempt:0,credit:0,brackets:[[0,0.0535],[48700,0.068],[193480,0.0785],[337930,0.0985]]}},MO:{single:{ded:16100,exempt:0,credit:0,brackets:[[1348,0.02],[2696,0.025],[4044,0.03],[5392,0.035],[6740,0.04],[8088,0.045],[9436,0.047]]},mfj:{ded:32200,exempt:0,credit:0,brackets:[[1348,0.02],[2696,0.025],[4044,0.03],[5392,0.035],[6740,0.04],[8088,0.045],[9436,0.047]]}},MS:{single:{ded:2300,exempt:6000,credit:0,brackets:[[10000,0.04]]},mfj:{ded:4600,exempt:12000,credit:0,brackets:[[10000,0.04]]}},MT:{single:{ded:16100,exempt:0,credit:0,brackets:[[0,0.047],[47500,0.0565]]},mfj:{ded:32200,exempt:0,credit:0,brackets:[[0,0.047],[95000,0.0565]]}},NC:{single:{ded:12750,exempt:0,credit:0,brackets:[[0,0.0399]]},mfj:{ded:25500,exempt:0,credit:0,brackets:[[0,0.0399]]}},ND:{single:{ded:16100,exempt:0,credit:0,brackets:[[48475,0.0195],[244825,0.025]]},mfj:{ded:32200,exempt:0,credit:0,brackets:[[80975,0.0195],[298075,0.025]]}},NE:{single:{ded:8850,exempt:0,credit:176,brackets:[[0,0.0246],[4130,0.0351],[24760,0.0455]]},mfj:{ded:17700,exempt:0,credit:352,brackets:[[0,0.0246],[8250,0.0351],[49530,0.0455]]}},NJ:{single:{ded:0,exempt:1000,credit:0,brackets:[[0,0.014],[20000,0.0175],[35000,0.035],[40000,0.05525],[75000,0.0637],[500000,0.0897],[1000000,0.1075]]},mfj:{ded:0,exempt:2000,credit:0,brackets:[[0,0.014],[20000,0.0175],[50000,0.0245],[70000,0.035],[80000,0.05525],[150000,0.0637],[500000,0.0897],[1000000,0.1075]]}},NM:{single:{ded:16100,exempt:0,credit:0,brackets:[[0,0.015],[5500,0.032],[16500,0.043],[33500,0.047],[66500,0.049],[210000,0.059]]},mfj:{ded:32200,exempt:0,credit:0,brackets:[[0,0.015],[8000,0.032],[25000,0.043],[50000,0.047],[100000,0.049],[315000,0.059]]}},NY:{single:{ded:8000,exempt:0,credit:0,brackets:[[0,0.039],[8500,0.044],[11700,0.0515],[13900,0.054],[80650,0.059],[215400,0.0685],[1077550,0.0965],[5000000,0.103],[25000000,0.109]]},mfj:{ded:16050,exempt:0,credit:0,brackets:[[0,0.039],[17150,0.044],[23600,0.0515],[27900,0.054],[161550,0.059],[323200,0.0685],[2155350,0.0965],[5000000,0.103],[25000000,0.109]]}},OH:{single:{ded:0,exempt:2400,credit:0,brackets:[[26050,0.0275]]},mfj:{ded:0,exempt:4800,credit:0,brackets:[[26050,0.0275]]}},OK:{single:{ded:6350,exempt:1000,credit:0,brackets:[[3750,0.025],[4900,0.035],[7200,0.045]]},mfj:{ded:12700,exempt:2000,credit:0,brackets:[[7500,0.025],[9800,0.035],[14400,0.045]]}},OR:{single:{ded:2910,exempt:0,credit:256,brackets:[[0,0.0475],[4550,0.0675],[11400,0.0875],[125000,0.099]]},mfj:{ded:5820,exempt:0,credit:512,brackets:[[0,0.0475],[9100,0.0675],[22800,0.0875],[250000,0.099]]}},PA:{single:{ded:0,exempt:0,credit:0,brackets:[[0,0.0307]]},mfj:{ded:0,exempt:0,credit:0,brackets:[[0,0.0307]]}},RI:{single:{ded:11200,exempt:5250,credit:0,brackets:[[0,0.0375],[82050,0.0475],[186450,0.0599]]},mfj:{ded:22400,exempt:10500,credit:0,brackets:[[0,0.0375],[82050,0.0475],[186450,0.0599]]}},SC:{single:{ded:8350,exempt:0,credit:0,brackets:[[0,0],[3640,0.03],[18230,0.06]]},mfj:{ded:16700,exempt:0,credit:0,brackets:[[0,0],[3640,0.03],[18230,0.06]]}},UT:{single:{ded:0,exempt:0,credit:966,brackets:[[0,0.045]]},mfj:{ded:0,exempt:0,credit:1932,brackets:[[0,0.045]]}},VA:{single:{ded:8750,exempt:930,credit:0,brackets:[[0,0.02],[3000,0.03],[5000,0.05],[17000,0.0575]]},mfj:{ded:17500,exempt:1860,credit:0,brackets:[[0,0.02],[3000,0.03],[5000,0.05],[17000,0.0575]]}},VT:{single:{ded:7650,exempt:5300,credit:0,brackets:[[0,0.0335],[49400,0.066],[119700,0.076],[249700,0.0875]]},mfj:{ded:15300,exempt:10600,credit:0,brackets:[[0,0.0335],[82500,0.066],[199450,0.076],[304000,0.0875]]}},WI:{single:{ded:13960,exempt:700,credit:0,brackets:[[0,0.035],[15110,0.044],[51950,0.053],[332720,0.0765]]},mfj:{ded:25840,exempt:1400,credit:0,brackets:[[0,0.035],[20150,0.044],[69260,0.053],[443630,0.0765]]}},WV:{single:{ded:0,exempt:2000,credit:0,brackets:[[0,0.0222],[10000,0.0296],[25000,0.0333],[40000,0.0444],[60000,0.0482]]},mfj:{ded:0,exempt:4000,credit:0,brackets:[[0,0.0222],[10000,0.0296],[25000,0.0333],[40000,0.0444],[60000,0.0482]]}}};

  function statusOf(status) {
    return status === 'single' ? 'single' : 'mfj';
  }

  function bracketTax(brackets, taxable) {
    if (!(taxable > 0) || !brackets) return 0;
    var tax = 0;
    for (var i = 0; i < brackets.length; i++) {
      var over = brackets[i][0];
      var next = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
      var hi = Math.min(taxable, next);
      if (hi > over) tax += (hi - over) * brackets[i][1];
    }
    return tax;
  }

  function marginalAt(brackets, taxable) {
    var rate = 0;
    var income = Math.max(0, taxable);
    for (var i = 0; i < brackets.length; i++) {
      if (income >= brackets[i][0]) rate = brackets[i][1];
    }
    return rate;
  }

  function ordinaryTax(status, taxable) {
    return bracketTax(FED[statusOf(status)], Math.max(0, taxable));
  }

  function federalMarginal(status, taxable) {
    return marginalAt(FED[statusOf(status)], taxable);
  }

  function ltcgTax(status, ordinaryTaxable, gain) {
    if (!(gain > 0)) return 0;
    var bands = LTCG[statusOf(status)];
    var start = Math.max(0, ordinaryTaxable);
    var end = start + gain;
    var tax = 0;
    for (var i = 0; i < bands.length; i++) {
      var over = bands[i][0];
      var next = i + 1 < bands.length ? bands[i + 1][0] : Infinity;
      var lo = Math.max(start, over);
      var hi = Math.min(end, next);
      if (hi > lo) tax += (hi - lo) * bands[i][1];
    }
    return tax;
  }

  function niitTax(status, income, gain) {
    if (!(gain > 0)) return 0;
    var excess = Math.max(0, income + gain - NIIT_THRESHOLD[statusOf(status)]);
    return NIIT_RATE * Math.min(gain, excess);
  }

  function wiDeduction(status, income) {
    var mfj = statusOf(status) === 'mfj';
    var full = mfj ? 25840 : 13960;
    var start = mfj ? 29039 : 20119;
    var end = mfj ? 159690 : 136453;
    if (income <= start) return full;
    if (income >= end) return 0;
    return full * (end - income) / (end - start);
  }

  function mnDeduction(status, income) {
    var full = statusOf(status) === 'mfj' ? 30600 : 15300;
    var t1 = 244400;
    var t2 = 337800;
    if (income <= t1) return full;
    var red = 0.03 * (Math.min(income, t2) - t1);
    if (income > t2) red += 0.10 * (income - t2);
    return Math.max(0, full - Math.min(red, 0.8 * full));
  }

  function ctExemption(status, income) {
    var mfj = statusOf(status) === 'mfj';
    var full = mfj ? 24000 : 15000;
    var start = mfj ? 48000 : 30000;
    return Math.max(0, full - Math.max(0, income - start));
  }

  function ctExtra(status, agi, taxable) {
    var mfj = statusOf(status) === 'mfj';
    var applied = Math.min(mfj ? 20000 : 10000, Math.max(0, taxable));
    var threshold = mfj ? 100500 : 56500;
    var per = mfj ? 2000 : 1000;
    var steps = agi > threshold ? Math.ceil((agi - threshold) / 5000) : 0;
    var extra = Math.min(applied, steps * per) * 0.025;
    if (mfj) {
      if (agi > 210000) extra += Math.min(500, Math.ceil((agi - 210000) / 10000) * 50);
      if (agi > 400000) {
        var mid = Math.ceil((Math.min(agi, 1000000) - 400000) / 10000) * 180;
        var top = agi > 1000000 ? Math.ceil((agi - 1000000) / 10000) * 100 : 0;
        extra += Math.min(6300, mid + top);
      }
    } else {
      if (agi > 105000) extra += Math.min(250, Math.ceil((agi - 105000) / 5000) * 25);
      if (agi > 200000) {
        var under = Math.ceil((Math.min(agi, 500000) - 200000) / 5000) * 90;
        var over = agi > 500000 ? Math.ceil((agi - 500000) / 5000) * 50 : 0;
        extra += Math.min(3150, under + over);
      }
    }
    return extra;
  }

  function ohioExempt(status, income) {
    var per = income <= 40000 ? 2400 : income <= 80000 ? 2150 : income < 500000 ? 1900 : 0;
    return per * (statusOf(status) === 'mfj' ? 2 : 1);
  }

  function utahCredit(status, income) {
    var mfj = statusOf(status) === 'mfj';
    return Math.max(0, (mfj ? 1932 : 966) - 0.013 * Math.max(0, income - (mfj ? 36426 : 18213)));
  }

  // Ordinary state tax after an extra deduction (mortgage interest).
  // Includes Maryland's county piggyback and New York City tax.
  // Does not include wage-only local taxes; those are in wageLocal.
  function stateIncomeTax(code, status, income, extraDeduction, city) {
    status = statusOf(status);
    income = Math.max(0, income || 0);
    extraDeduction = Math.max(0, extraDeduction || 0);
    if (!code || !STATES[code]) return 0;
    if (code === 'UT') {
      return Math.max(0, Math.max(0, income - extraDeduction) * 0.045 - utahCredit(status, income));
    }
    var side = STATES[code][status];
    var ded = side.ded;
    var exempt = side.exempt;
    if (code === 'WI') ded = wiDeduction(status, income);
    if (code === 'MN') ded = mnDeduction(status, income);
    if (code === 'CT') exempt = ctExemption(status, income);
    if (code === 'OH') exempt = ohioExempt(status, income);
    if (code === 'IL' && income > (status === 'mfj' ? 500000 : 250000)) exempt = 0;
    var taxable = Math.max(0, income - ded - exempt - extraDeduction);
    var tax = bracketTax(side.brackets, taxable) - (side.credit || 0);
    if (tax < 0) tax = 0;
    if (code === 'CT') tax += ctExtra(status, income, taxable);
    if (code === 'MD') tax += 0.024 * taxable;
    if (code === 'NY' && city === 'New York') tax += bracketTax(NYC[status], taxable);
    return tax;
  }

  function wageLocal(code, city, income) {
    income = Math.max(0, income || 0);
    if (code === 'PA' && city === 'Philadelphia') return income * PHILLY_WAGE;
    if (code === 'NY' && city === 'New York') return 0;
    return income * (WAGE_LOCAL[code] || 0);
  }

  function saltBill(code, status, income, city) {
    return stateIncomeTax(code, status, income, 0, city) + wageLocal(code, city, income);
  }

  function stateMarginal(code, status, income, city) {
    if (!(income > 0)) return 0;
    var hi = stateIncomeTax(code, status, income, 0, city);
    var lo = stateIncomeTax(code, status, income - 1, 0, city);
    return Math.max(0, hi - lo);
  }

  function taxOnGain(opts) {
    var status = statusOf(opts.status);
    var income = Math.max(0, opts.income || 0);
    var gain = Math.max(0, opts.taxableGain || 0);
    if (!(gain > 0)) return 0;
    var std = FED_STD[status];
    var ordinary = Math.max(0, income - std);
    var taxedGain = Math.max(0, gain - Math.max(0, std - income));
    var fed = opts.longTerm
      ? ltcgTax(status, ordinary, taxedGain)
      : ordinaryTax(status, ordinary + taxedGain) - ordinaryTax(status, ordinary);
    // NIIT uses MAGI, which is before the standard deduction. The §121 exclusion is already out of `gain`.
    var niit = niitTax(status, income, gain);
    var state = stateIncomeTax(opts.state, status, income + gain, 0, opts.city)
      - stateIncomeTax(opts.state, status, income, 0, opts.city);
    if (state < 0) state = 0;
    if (opts.state === 'MD' && income + gain > 350000) state += 0.02 * gain;
    if (opts.state === 'MN') state += 0.01 * Math.max(0, gain - 1000000);
    return fed + niit + state;
  }

  function profile(code, status, income, city) {
    status = statusOf(status);
    income = Math.max(0, income || 0);
    var taxable = Math.max(0, income - FED_STD[status]);
    return {
      taxable: taxable,
      federalMarginal: federalMarginal(status, taxable),
      federalTax: ordinaryTax(status, taxable),
      stateMarginal: stateMarginal(code, status, income, city),
      stateTax: saltBill(code, status, income, city)
    };
  }

  // Year 0 of a projection is tax year 2026. The cap rises 1% a year through 2029.
  // In 2030 it returns to $10,000.
  function saltCapForYear(yearIndex, magi) {
    var year = Math.max(0, yearIndex | 0);
    if (year >= 4) return 10000;
    var cap = Math.round(40400 * Math.pow(1.01, year));
    var start = Math.round(505000 * Math.pow(1.01, year));
    if (magi == null || !isFinite(magi)) return cap;
    return Math.max(10000, cap - Math.max(0, magi - start) * 0.30);
  }

  root.TaxRules = {
    FED_STD: FED_STD,
    ordinaryTax: ordinaryTax,
    federalMarginal: federalMarginal,
    stateIncomeTax: stateIncomeTax,
    saltBill: saltBill,
    stateMarginal: stateMarginal,
    taxOnGain: taxOnGain,
    profile: profile,
    saltCapForYear: saltCapForYear,
    wageLocal: wageLocal
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
