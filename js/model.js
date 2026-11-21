(function (root) {
  'use strict';

  // Tax year 2026. Standard deduction: IRS Rev. Proc. 2025-32.
  // SALT cap: IRC §164(b)(7), $40,400, phased down above $505,000 MAGI to a $10,000 floor.
  // Mortgage cap: IRC §163(h), $750,000 of acquisition debt (single and joint).
  // Home-sale exclusion: IRC §121, $250,000 / $500,000, unchanged since 1997.
  var RULES = {
    taxYear: 2026,
    standardDeduction: { single: 16100, mfj: 32200 },
    saltCap: 40400,
    saltFloor: 10000,
    saltPhaseoutStart: 505000,
    saltPhaseoutRate: 0.30,
    mortgageCap: { single: 750000, mfj: 750000 },
    gainExclusion: { single: 250000, mfj: 500000 },
    prop13Cap: 0.02,
    // California never adopted the 2017 cap: its return deducts interest on up to $1,000,000.
    stateMortgageCap: { CA: 1000000 }
  };

  // The return a typical (median) path compounds at, from the expected yearly return and its volatility.
  // Wealth multiplies, so the median grows at (1+mu)e^(-sigma^2/2) - 1, not at mu (companion, eq-drag-limit).
  function typicalReturn(mean, vol) {
    var m = typeof mean === 'number' && isFinite(mean) ? mean : 0;
    var v = typeof vol === 'number' && isFinite(vol) ? Math.max(0, vol) : 0;
    return (1 + m) * Math.exp(-v * v / 2) - 1;
  }

  function finite(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  function clamp(value, lo, hi) {
    return Math.min(hi, Math.max(lo, value));
  }

  function saltCapAmount(magi) {
    if (magi == null || !isFinite(magi)) return RULES.saltCap;
    var reduction = Math.max(0, magi - RULES.saltPhaseoutStart) * RULES.saltPhaseoutRate;
    return Math.max(RULES.saltFloor, RULES.saltCap - reduction);
  }

  function normalize(input) {
    var src = input || {};
    var status = src.filingStatus === 'single' ? 'single' : 'mfj';
    var price = Math.max(0, finite(src.price, 0));
    var growth = src.taxGrowth;
    if (growth !== 'prop13' && growth !== 'inflation') growth = 'market';
    return {
      // 'sell': both sides cash out at the end and pay selling costs and tax on their gains.
      // 'keep': both keep what they have, valued at market, with nothing sold.
      exit: src.exit === 'keep' ? 'keep' : 'sell',
      price: price,
      downPayment: clamp(finite(src.downPayment, 0), 0, price),
      annualRate: clamp(finite(src.annualRate, 0), 0, 0.5),
      years: clamp(finite(src.years, 30), 0, 50),
      horizonYears: clamp(finite(src.horizonYears, 30), 0, 50),
      propertyTaxRate: clamp(finite(src.propertyTaxRate, 0), 0, 0.2),
      taxGrowth: growth,
      insuranceYear: Math.max(0, finite(src.insuranceYear, 0)),
      maintenanceRate: clamp(finite(src.maintenanceRate, 0), 0, 0.2),
      hoaMonth: Math.max(0, finite(src.hoaMonth, 0)),
      pmiRate: clamp(finite(src.pmiRate, 0), 0, 0.05),
      closingCostRate: clamp(finite(src.closingCostRate, 0), 0, 0.2),
      sellingCostRate: clamp(finite(src.sellingCostRate, 0), 0, 0.2),
      homeAppreciation: clamp(finite(src.homeAppreciation, 0), -0.5, 0.5),
      stockReturn: clamp(finite(src.stockReturn, 0), -0.5, 0.5),
      // Volatility of the stock return. 0 compounds the typed return as if it arrived every year.
      stockVol: clamp(finite(src.stockVol, 0), 0, 1),
      // Rent growth. Missing means inflation, the older behavior.
      rentGrowth: clamp(finite(src.rentGrowth, finite(src.inflation, 0)), -0.5, 0.5),
      investmentDrag: clamp(finite(src.investmentDrag, 0), 0, 0.2),
      inflation: clamp(finite(src.inflation, 0), 0, 0.2),
      rentMonth: Math.max(0, finite(src.rentMonth, 0)),
      filingStatus: status,
      federalRate: clamp(finite(src.federalRate, 0), 0, 0.5),
      stateRate: clamp(finite(src.stateRate, 0), 0, 0.2),
      ltcgRate: clamp(finite(src.ltcgRate, 0), 0, 0.4),
      otherSalt: Math.max(0, finite(src.otherSalt, 0)),
      otherItemized: Math.max(0, finite(src.otherItemized, 0)),
      magi: src.magi == null || src.magi === '' || !isFinite(src.magi) ? null : Math.max(0, src.magi),
      // Household wages, treated as MAGI. Null keeps the flat rates passed in.
      income: src.income == null || src.income === '' || !isFinite(+src.income) ? null : Math.max(0, +src.income),
      stateCode: typeof src.stateCode === 'string' ? src.stateCode : '',
      cityName: typeof src.cityName === 'string' ? src.cityName : ''
    };
  }

  function mortgagePayment(principal, annualRate, years) {
    var n = Math.round(years * 12);
    if (!(principal > 0) || n <= 0) return 0;
    var r = annualRate / 12;
    if (r === 0) return principal / n;
    var powN = Math.pow(1 + r, n);
    return principal * (r * powN) / (powN - 1);
  }

  // Closed form for tests. The projection itself amortizes month by month.
  function balanceAfter(principal, annualRate, years, monthsPaid) {
    var n = Math.round(years * 12);
    var t = Math.max(0, monthsPaid);
    if (!(principal > 0) || t <= 0) return Math.max(0, principal);
    if (t >= n) return 0;
    var r = annualRate / 12;
    if (r === 0) return principal * (1 - t / n);
    var powT = Math.pow(1 + r, t);
    var payment = mortgagePayment(principal, annualRate, years);
    return principal * powT - payment * (powT - 1) / r;
  }

  function annualPropertyTax(input, year) {
    var spec = normalize(input);
    var g = spec.homeAppreciation;
    if (spec.taxGrowth === 'prop13') g = Math.min(spec.inflation, RULES.prop13Cap);
    else if (spec.taxGrowth === 'inflation') g = spec.inflation;
    return spec.price * Math.pow(1 + g, year) * spec.propertyTaxRate;
  }

  function monthCosts(input, year) {
    var spec = normalize(input);
    var growth = Math.pow(1 + spec.inflation, year);
    return {
      propertyTax: annualPropertyTax(spec, year) / 12,
      insurance: spec.insuranceYear * growth / 12,
      maintenance: spec.price * spec.maintenanceRate * growth / 12,
      hoa: spec.hoaMonth * growth,
      rent: spec.rentMonth * Math.pow(1 + spec.rentGrowth, year)
    };
  }

  function beginTaxYear(input, salt, std) {
    var other = Math.min(input.otherSalt, salt) + input.otherItemized;
    var tax = {
      std: std,
      federalRate: input.federalRate,
      stateRate: input.stateRate,
      other: other,
      ytdHousing: 0,
      ytdProp: 0,
      ytdInterest: 0,
      ytdStateProp: 0,
      otherItemized: input.otherItemized,
      saltRoom: Math.max(0, salt - input.otherSalt),
      prevBenefit: Math.max(0, other - std) * input.federalRate,
      prevStateBenefit: 0,
      income: input.income,
      filingStatus: input.filingStatus,
      stateCode: input.stateCode,
      cityName: input.cityName
    };
    if (input.income != null) {
      var taxableRent = Math.max(0, input.income - Math.max(std, other));
      tax.rentFederal = TaxRules.ordinaryTax(input.filingStatus, taxableRent);
      // The renter's state return: other itemized deductions, or the state standard deduction.
      tax.stateBase = TaxRules.stateIncomeTax(input.stateCode, input.filingStatus, input.income, input.otherItemized, input.cityName, 0);
      tax.prevBenefit = 0;
    }
    return tax;
  }

  // Federal savings are only the housing deductions that clear the standard
  // deduction beyond what the household could already itemize without the house.
  // With an income, that difference is computed on the 2026 brackets. Otherwise
  // it is the flat federal rate passed in.
  function addHousing(tax, deductibleInterest, propertyTaxMonth, stateInterest) {
    if (stateInterest == null) stateInterest = deductibleInterest;
    var room = Math.max(0, tax.saltRoom - tax.ytdProp);
    var propDeduct = Math.min(Math.max(0, propertyTaxMonth), room);
    tax.ytdProp += propDeduct;
    tax.ytdHousing += deductibleInterest + propDeduct;
    var fedIncrement;
    if (tax.income == null) {
      var ownerBenefit = Math.max(0, tax.other + tax.ytdHousing - tax.std) * tax.federalRate;
      fedIncrement = ownerBenefit - tax.prevBenefit;
      tax.prevBenefit = ownerBenefit;
    } else {
      var itemized = tax.other + tax.ytdHousing;
      var taxableOwn = Math.max(0, tax.income - Math.max(tax.std, itemized));
      var benefit = tax.rentFederal - TaxRules.ordinaryTax(tax.filingStatus, taxableOwn);
      fedIncrement = benefit - tax.prevBenefit;
      tax.prevBenefit = benefit;
    }
    var stateSavings;
    if (tax.income == null) {
      stateSavings = stateInterest * tax.stateRate;
    } else {
      // The owner's state return adds mortgage interest and the whole property tax bill (state
      // returns have no SALT cap). Itemizing replaces the state standard deduction.
      tax.ytdInterest += stateInterest;
      tax.ytdStateProp += Math.max(0, propertyTaxMonth);
      var home = tax.ytdInterest + tax.ytdStateProp;
      var stateBenefit = tax.stateBase - TaxRules.stateIncomeTax(tax.stateCode, tax.filingStatus, tax.income,
        tax.otherItemized + home, tax.cityName, home);
      stateSavings = stateBenefit - tax.prevStateBenefit;
      tax.prevStateBenefit = stateBenefit;
    }
    return {
      propDeduct: propDeduct,
      fedIncrement: fedIncrement,
      stateSavings: stateSavings,
      ytdHousing: tax.ytdHousing,
      ownerItemized: tax.other + tax.ytdHousing
    };
  }

  function project(raw) {
    var input = normalize(raw);
    var nLoan = Math.round(input.years * 12);
    var nHor = Math.round(input.horizonYears * 12);
    var price = input.price;
    var loan0 = price - input.downPayment;
    var r = input.annualRate / 12;
    var payment = mortgagePayment(loan0, input.annualRate, input.years);
    var cap = RULES.mortgageCap[input.filingStatus];
    var std = RULES.standardDeduction[input.filingStatus];
    var exclusion = RULES.gainExclusion[input.filingStatus];
    var salt = saltCapAmount(input.magi);
    var stockTypical = typicalReturn(input.stockReturn, input.stockVol);
    var stockAnnual = stockTypical - input.investmentDrag;
    var stateCap = RULES.stateMortgageCap[input.stateCode] || cap;
    var stockMonthly = Math.pow(1 + stockAnnual, 1 / 12) - 1;
    var homeMonthly = Math.pow(1 + input.homeAppreciation, 1 / 12) - 1;
    var closing = price * input.closingCostRate;
    var basis = price + closing;

    var home = price;
    var balance = loan0;
    // Each side's stock account and what went into it. Cashing out taxes the gain above that basis.
    var taxPort = 0;
    var taxBasis = 0;
    var rentPort = input.downPayment + closing;
    var rentBasis = rentPort;

    // Tax on a gain stacked on top of `extra` other gain the same year. Long-term means held over a year.
    function gainTax(gain, extra, heldLong) {
      if (!(gain > 0)) return 0;
      if (input.income == null) {
        return gain * ((heldLong ? input.ltcgRate : input.federalRate) + input.stateRate);
      }
      return TaxRules.taxOnGain({
        income: input.income + Math.max(0, extra),
        status: input.filingStatus,
        state: input.stateCode,
        city: input.cityName,
        taxableGain: gain,
        longTerm: heldLong
      });
    }

    function mark(month) {
      if (input.exit === 'keep') {
        var keepHouse = home - balance + taxPort;
        var keepDiscount = Math.pow(1 + input.inflation, month / 12);
        return {
          month: month, home: home, balance: balance, gain: Math.max(0, home - basis), gainsTax: 0,
          taxPortfolio: taxPort, rentPortfolio: rentPort, ownerStockTax: 0, renterStockTax: 0,
          houseNominal: keepHouse, rentNominal: rentPort,
          houseReal: keepHouse / keepDiscount, rentReal: rentPort / keepDiscount
        };
      }
      var realized = home * (1 - input.sellingCostRate);
      var gain = Math.max(0, realized - basis);
      var heldLong = month > 12;
      var excluded = month >= 24 ? exclusion : 0;
      var taxable = Math.max(0, gain - excluded);
      var gainsTax = gainTax(taxable, 0, heldLong);
      // The owner's account is sold the same year as the house, so its gain stacks on the house gain.
      var ownerStockGain = Math.max(0, taxPort - taxBasis);
      var ownerStockTax = gainTax(ownerStockGain, taxable, heldLong);
      var renterStockGain = Math.max(0, rentPort - rentBasis);
      var renterStockTax = gainTax(renterStockGain, 0, heldLong);
      var nominalHouse = realized - balance - gainsTax + taxPort - ownerStockTax;
      var nominalRent = rentPort - renterStockTax;
      var discount = Math.pow(1 + input.inflation, month / 12);
      return {
        month: month,
        home: home,
        balance: balance,
        gain: gain,
        gainsTax: gainsTax,
        taxPortfolio: taxPort,
        rentPortfolio: rentPort,
        ownerStockTax: ownerStockTax,
        renterStockTax: renterStockTax,
        houseNominal: nominalHouse,
        rentNominal: nominalRent,
        houseReal: nominalHouse / discount,
        rentReal: nominalRent / discount
      };
    }

    var points = [mark(0)];
    var totalInterest = 0;
    var pmiMonths = 0;
    var seenPmi = false;
    var pmiStopMonth = null;
    var first = null;
    var firstYearFederal = 0;
    var firstYearState = 0;
    var tax = null;

    for (var m = 0; m < nHor; m++) {
      if (m % 12 === 0) {
        var saltYear = input.income == null ? salt : TaxRules.saltCapForYear(m / 12, input.income);
        tax = beginTaxYear(input, saltYear, std);
      }

      var startBalance = balance;
      home *= 1 + homeMonthly;

      var interest = 0;
      var principal = 0;
      if (startBalance > 0 && m < nLoan) {
        if (r === 0) {
          principal = Math.min(payment, startBalance);
        } else {
          var accrued = startBalance * r;
          if (payment < accrued) {
            interest = payment;
            principal = 0;
          } else {
            interest = accrued;
            principal = Math.min(payment - accrued, startBalance);
          }
        }
        balance = startBalance - principal;
        if (balance < 0.005) balance = 0;
      }

      var costs = monthCosts(input, Math.floor(m / 12));
      var pmi = 0;
      // Homeowners Protection Act: cancellation is based on the original value, not appreciation.
      if (loan0 > 0 && startBalance > price * 0.8 + 1e-6 && m < nLoan) {
        pmi = loan0 * input.pmiRate / 12;
        pmiMonths += 1;
        seenPmi = true;
      } else if (seenPmi && pmiStopMonth == null) {
        pmiStopMonth = m + 1;
      }

      var fraction = startBalance > 0 ? Math.min(1, cap / startBalance) : 0;
      var dedInterest = interest * fraction;
      var stateInterest = interest * (startBalance > 0 ? Math.min(1, stateCap / startBalance) : 0);
      var taxBits = addHousing(tax, dedInterest, costs.propertyTax, stateInterest);
      var stateSavings = taxBits.stateSavings;
      var savings = taxBits.fedIncrement + stateSavings;
      var ownerOutlay = interest + principal + costs.propertyTax + costs.insurance + costs.maintenance + costs.hoa + pmi;

      // Whoever pays less for housing that month invests the difference. Tax savings are invested
      // on the buy side and are not also removed from the renter's deposit, or the deduction
      // would be counted twice.
      var gap = ownerOutlay - costs.rent;
      var renterDeposit = Math.max(0, gap);
      var ownerDeposit = savings + Math.max(0, -gap);
      taxPort = taxPort * (1 + stockMonthly) + ownerDeposit;
      taxBasis = Math.max(0, taxBasis + ownerDeposit);
      rentPort = rentPort * (1 + stockMonthly) + renterDeposit;
      rentBasis += renterDeposit;

      totalInterest += interest;
      if (m < 12) {
        firstYearFederal += taxBits.fedIncrement;
        firstYearState += stateSavings;
      }
      if (m === 0) {
        first = {
          loan: loan0,
          r: r,
          n: nLoan,
          growthFactor: nLoan > 0 ? Math.pow(1 + r, nLoan) : 1,
          payment: payment,
          interest: interest,
          principal: principal,
          propertyTax: costs.propertyTax,
          insurance: costs.insurance,
          maintenance: costs.maintenance,
          hoa: costs.hoa,
          pmi: pmi,
          ownerOutlay: ownerOutlay,
          rent: costs.rent,
          renterDeposit: renterDeposit,
          ownerDeposit: ownerDeposit,
          savings: savings,
          federalSavings: taxBits.fedIncrement,
          stateSavings: stateSavings,
          deductibleInterest: dedInterest,
          stateDeductibleInterest: stateInterest,
          interestFraction: fraction,
          debtCap: cap,
          startBalance: startBalance,
          propertyTaxDeductible: taxBits.propDeduct,
          ytdHousing: taxBits.ytdHousing,
          standardDeduction: std,
          saltCap: salt
        };
      }
      points.push(mark(m + 1));
    }

    var crossoverMonth = null;
    for (var i = 0; i < points.length; i++) {
      if (points[i].houseReal >= points[i].rentReal) {
        crossoverMonth = i;
        break;
      }
    }

    // Poterba's user cost: what owning costs per dollar of house each year, against the rent yield.
    // The opportunity cost is the stock return the down payment would have compounded at.
    var userParts = {
      opportunity: stockAnnual,
      propertyTax: input.propertyTaxRate,
      maintenance: input.maintenanceRate,
      insurance: price > 0 ? input.insuranceYear / price : 0,
      hoa: price > 0 ? input.hoaMonth * 12 / price : 0,
      appreciation: input.homeAppreciation,
      transactions: input.horizonYears > 0
        ? (input.closingCostRate + (input.exit === 'keep' ? 0 : input.sellingCostRate)) / input.horizonYears : 0
    };
    var userCost = userParts.opportunity + userParts.propertyTax + userParts.maintenance + userParts.insurance
      + userParts.hoa - userParts.appreciation + userParts.transactions;

    var last = points[points.length - 1];
    return {
      input: input,
      points: points,
      first: first,
      stockTypical: stockTypical,
      stockAnnual: stockAnnual,
      userCost: {
        u: userCost,
        parts: userParts,
        rentYield: price > 0 ? 12 * input.rentMonth / price : 0
      },
      totals: {
        interest: totalInterest,
        pmiMonths: pmiMonths,
        pmiStopMonth: pmiStopMonth,
        firstYearFederal: firstYearFederal,
        firstYearState: firstYearState,
        firstYearSavings: firstYearFederal + firstYearState,
        crossoverMonth: crossoverMonth,
        endsAhead: last.houseReal >= last.rentReal,
        horizonMonths: nHor,
        loanMonths: nLoan
      }
    };
  }

  // Price sweep: keep the down-payment percent, maintenance rate, and cost-to-sell
  // rates. Scale the insurance quote with the price. Rent and HOA stay put.
  function atPrice(raw, price) {
    var input = normalize(raw);
    var ratio = input.price > 0 ? price / input.price : 0;
    var next = {};
    var key;
    for (key in input) next[key] = input[key];
    next.price = price;
    next.downPayment = input.downPayment * ratio;
    next.insuranceYear = input.insuranceYear * ratio;
    return next;
  }

  root.FinanceModel = {
    RULES: RULES,
    normalize: normalize,
    saltCapAmount: saltCapAmount,
    typicalReturn: typicalReturn,
    mortgagePayment: mortgagePayment,
    balanceAfter: balanceAfter,
    annualPropertyTax: annualPropertyTax,
    monthCosts: monthCosts,
    project: project,
    atPrice: atPrice
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
