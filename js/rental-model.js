(function (root) {
  'use strict';

  // A rental versus the same cash in stocks.
  // Residential depreciation is 27.5 years, straight line. The mid-month convention is ignored.
  // The $25,000 active-participation allowance phases out from $100,000 to $150,000 of income
  // and is not doubled on a joint return. Real estate professional status is not modeled.
  var DEP_MONTHS = 27.5 * 12;
  // Rent rises with price, but a more expensive house yields a little less.
  var RENT_ELASTICITY = 0.85;

  function finite(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  function clamp(value, lo, hi) {
    return Math.min(hi, Math.max(lo, value));
  }

  function normalize(input) {
    var src = input || {};
    var status = src.filingStatus === 'single' ? 'single' : 'mfj';
    var price = Math.max(0, finite(src.price, 0));
    var growth = src.taxGrowth;
    if (growth !== 'prop13' && growth !== 'inflation') growth = 'market';
    return {
      // 'sell': cash out at the end, with selling costs, recapture, and tax on both sides' gains.
      // 'keep': hold everything at market value, nothing sold, no tax at the end.
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
      stockVol: clamp(finite(src.stockVol, 0), 0, 1),
      rentGrowth: clamp(finite(src.rentGrowth, finite(src.inflation, 0)), -0.5, 0.5),
      investmentDrag: clamp(finite(src.investmentDrag, 0), 0, 0.2),
      inflation: clamp(finite(src.inflation, 0), 0, 0.2),
      rentMonth: Math.max(0, finite(src.rentMonth, 0)),
      vacancyRate: clamp(finite(src.vacancyRate, 0.05), 0, 0.9),
      managementRate: clamp(finite(src.managementRate, 0), 0, 0.5),
      landFraction: clamp(finite(src.landFraction, 0.2), 0, 0.95),
      filingStatus: status,
      income: src.income == null || src.income === '' || !isFinite(+src.income) ? 0 : Math.max(0, +src.income),
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

  function monthlyFromAnnual(annual) {
    if (annual <= -0.999) return -0.999;
    return Math.pow(1 + annual, 1 / 12) - 1;
  }

  function passiveAllowance(income) {
    if (income >= 150000) return 0;
    if (income <= 100000) return 25000;
    return 25000 * (150000 - income) / 50000;
  }

  function ordinaryOnExtra(spec, extra) {
    var Rules = root.TaxRules;
    if (!Rules || !extra) return 0;
    var status = spec.filingStatus;
    var income = spec.income;
    var std = status === 'single' ? 16100 : 32200;
    var fed = Rules.ordinaryTax(status, Math.max(0, income + extra - std)) - Rules.ordinaryTax(status, Math.max(0, income - std));
    var state = Rules.stateIncomeTax(spec.stateCode, status, Math.max(0, income + extra), 0, spec.cityName)
      - Rules.stateIncomeTax(spec.stateCode, status, income, 0, spec.cityName);
    var niit = 0;
    if (extra > 0) {
      var threshold = status === 'single' ? 200000 : 250000;
      niit = 0.038 * Math.min(extra, Math.max(0, income + extra - threshold));
    }
    return fed + Math.max(-1e12, state) + niit;
  }

  function yearPosition(spec, ytdProfit, suspendedStart) {
    if (ytdProfit >= 0) {
      var use = Math.min(Math.max(0, suspendedStart), ytdProfit);
      return { recognized: ytdProfit - use, suspended: Math.max(0, suspendedStart) - use };
    }
    var allowed = Math.min(-ytdProfit, passiveAllowance(spec.income));
    return { recognized: -allowed, suspended: Math.max(0, suspendedStart) + (-ytdProfit - allowed) };
  }

  // Tax on selling the rental, beyond the tax on wages alone.
  // U is depreciation taken (unrecaptured section 1250 gain), G the rest of the gain, L the suspended
  // passive losses. Section 469(g) frees L at the sale as an ordinary deduction, so it comes off the
  // wages first. U is stacked on what is left and taxed at ordinary rates, but never above 25%.
  // G is stacked on top of both. Returns the tax and the ordinary income the gain sat on.
  function saleTax(spec, U, G, L, longTerm) {
    var Rules = root.TaxRules;
    U = Math.max(0, U);
    G = Math.max(0, G);
    L = Math.max(0, L);
    if (!Rules) return { tax: 0, base: spec.income };
    if (!longTerm) {
      // A sale within a year is all ordinary income.
      U += G;
      G = 0;
    }
    var status = spec.filingStatus;
    var income = spec.income;
    var std = status === 'single' ? 16100 : 32200;
    var afterLoss = income - L;
    var base = afterLoss + U;
    var fedLoss = Rules.ordinaryTax(status, Math.max(0, afterLoss - std)) - Rules.ordinaryTax(status, Math.max(0, income - std));
    var fedU = Rules.ordinaryTax(status, Math.max(0, base - std)) - Rules.ordinaryTax(status, Math.max(0, afterLoss - std));
    if (longTerm) fedU = Math.min(fedU, 0.25 * U);
    var state = Rules.stateIncomeTax(spec.stateCode, status, Math.max(0, base), 0, spec.cityName)
      - Rules.stateIncomeTax(spec.stateCode, status, income, 0, spec.cityName);
    var threshold = status === 'single' ? 200000 : 250000;
    var nii = Math.max(0, U - L);
    var niit = 0.038 * Math.min(nii, Math.max(0, base - threshold));
    var cap = G > 0 ? Rules.taxOnGain({
      status: status,
      state: spec.stateCode,
      city: spec.cityName,
      income: Math.max(0, base),
      taxableGain: G,
      longTerm: true
    }) : 0;
    return { tax: fedLoss + fedU + state + niit + cap, base: Math.max(0, base) + G };
  }

  // Tax on a stock account's gain, stacked on `base` income.
  function stockTax(spec, gain, base, longTerm) {
    var Rules = root.TaxRules;
    if (!Rules || !(gain > 0)) return 0;
    return Rules.taxOnGain({
      status: spec.filingStatus,
      state: spec.stateCode,
      city: spec.cityName,
      income: Math.max(0, base),
      taxableGain: gain,
      longTerm: longTerm
    });
  }

  function project(raw) {
    var spec = normalize(raw);
    var price = spec.price;
    var down = spec.downPayment;
    var loan0 = Math.max(0, price - down);
    var closing = price * spec.closingCostRate;
    var basis = price + closing;
    var depreciable = basis * (1 - spec.landFraction);
    var depMonth = DEP_MONTHS > 0 ? depreciable / DEP_MONTHS : 0;
    var nHor = Math.max(0, Math.round(spec.horizonYears * 12));
    var nLoan = Math.max(0, Math.round(spec.years * 12));
    var payment = mortgagePayment(loan0, spec.annualRate, spec.years);
    var r = spec.annualRate / 12;
    var homeMonthly = monthlyFromAnnual(spec.homeAppreciation);
    // The typical path compounds at (1+mu)e^(-sigma^2/2) - 1 (companion, eq-drag-limit).
    var stockTypical = (1 + spec.stockReturn) * Math.exp(-spec.stockVol * spec.stockVol / 2) - 1;
    var stockMonthly = monthlyFromAnnual(stockTypical - spec.investmentDrag);
    var home = price;
    var balance = loan0;
    var stock = down + closing;
    var stockBasis = stock;
    var side = 0;
    var sideBasis = 0;
    var accumDep = 0;
    var suspendedStart = 0;
    var recognizedTax = 0;
    var ytd = blankYear();

    function blankYear() {
      return { collected: 0, interest: 0, tax: 0, ins: 0, maint: 0, hoa: 0, mgmt: 0, pmi: 0, dep: 0 };
    }

    function ytdProfit() {
      return ytd.collected - ytd.interest - ytd.tax - ytd.ins - ytd.maint - ytd.hoa - ytd.mgmt - ytd.pmi - ytd.dep;
    }

    function annualPropertyTax(year) {
      var g = spec.homeAppreciation;
      if (spec.taxGrowth === 'prop13') g = Math.min(spec.inflation, 0.02);
      else if (spec.taxGrowth === 'inflation') g = spec.inflation;
      return price * Math.pow(1 + g, year) * spec.propertyTaxRate;
    }

    function monthCosts(year) {
      var growth = Math.pow(1 + spec.inflation, year);
      var rent = spec.rentMonth * Math.pow(1 + spec.rentGrowth, year);
      var collected = rent * (1 - spec.vacancyRate);
      return {
        rent: rent,
        collected: collected,
        vacancy: rent - collected,
        management: collected * spec.managementRate,
        propertyTax: annualPropertyTax(year) / 12,
        insurance: spec.insuranceYear * growth / 12,
        maintenance: price * spec.maintenanceRate * growth / 12,
        hoa: spec.hoaMonth * growth
      };
    }

    function mark(month) {
      var pos = yearPosition(spec, ytdProfit(), suspendedStart);
      var realized = home * (1 - spec.sellingCostRate);
      var gain = Math.max(0, realized - (basis - accumDep));
      var recapture = Math.min(accumDep, gain);
      var capGain = Math.max(0, gain - recapture);
      var heldLong = month > 12;
      var keep = spec.exit === 'keep';
      var sale = keep ? { tax: 0, base: spec.income } : saleTax(spec, recapture, capGain, pos.suspended, heldLong);
      var tax = sale.tax;
      // The side account is sold the same year, on top of the rental gain.
      var sideTax = keep ? 0 : stockTax(spec, side - sideBasis, sale.base, heldLong);
      var stockOnlyTax = keep ? 0 : stockTax(spec, stock - stockBasis, spec.income, heldLong);
      var proceeds = (keep ? home : realized) - balance - tax;
      var rentalNominal = proceeds + side - sideTax;
      var stockNominal = stock - stockOnlyTax;
      var discount = Math.pow(1 + spec.inflation, month / 12);
      if (!(discount > 0)) discount = 1;
      return {
        month: month,
        home: home,
        balance: balance,
        stock: stock,
        side: side,
        gain: gain,
        saleTax: tax,
        depreciation: accumDep,
        suspended: pos.suspended,
        sideTax: sideTax,
        stockTax: stockOnlyTax,
        rentalNominal: rentalNominal,
        stockNominal: stockNominal,
        rentalReal: rentalNominal / discount,
        stockReal: stockNominal / discount
      };
    }

    var points = [mark(0)];
    var totalInterest = 0;
    var pmiMonths = 0;
    var seenPmi = false;
    var pmiStopMonth = null;
    var first = null;
    var firstYearCash = 0;
    var firstYearTax = 0;
    var firstYearDep = 0;

    for (var m = 0; m < nHor; m++) {
      if (m > 0 && m % 12 === 0) {
        suspendedStart = yearPosition(spec, ytdProfit(), suspendedStart).suspended;
        recognizedTax = 0;
        ytd = blankYear();
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
      totalInterest += interest;

      var year = Math.floor(m / 12);
      var c = monthCosts(year);
      var pmi = 0;
      if (loan0 > 0 && startBalance > price * 0.8 + 1e-6 && m < nLoan) {
        pmi = loan0 * spec.pmiRate / 12;
        pmiMonths += 1;
        seenPmi = true;
      } else if (seenPmi && pmiStopMonth == null) {
        pmiStopMonth = m + 1;
      }

      var dep = 0;
      if (accumDep < depreciable - 1e-6) {
        dep = Math.min(depMonth, depreciable - accumDep);
        accumDep += dep;
      }

      ytd.collected += c.collected;
      ytd.interest += interest;
      ytd.tax += c.propertyTax;
      ytd.ins += c.insurance;
      ytd.maint += c.maintenance;
      ytd.hoa += c.hoa;
      ytd.mgmt += c.management;
      ytd.pmi += pmi;
      ytd.dep += dep;

      var pos = yearPosition(spec, ytdProfit(), suspendedStart);
      var taxNow = ordinaryOnExtra(spec, pos.recognized);
      var taxCash = taxNow - recognizedTax;
      recognizedTax = taxNow;

      var cashFlow = c.collected - c.management - c.propertyTax - c.insurance - c.maintenance - c.hoa - pmi - interest - principal - taxCash;
      stock *= 1 + stockMonthly;
      side *= 1 + stockMonthly;
      if (cashFlow >= 0) {
        side += cashFlow;
        sideBasis += cashFlow;
      } else {
        stock += -cashFlow;
        stockBasis += -cashFlow;
      }

      var point = mark(m + 1);
      point.rent = c.rent;
      point.collected = c.collected;
      point.vacancy = c.vacancy;
      point.management = c.management;
      point.propertyTax = c.propertyTax;
      point.insurance = c.insurance;
      point.maintenance = c.maintenance;
      point.hoa = c.hoa;
      point.pmi = pmi;
      point.interest = interest;
      point.principal = principal;
      point.payment = interest + principal;
      point.depMonth = dep;
      point.incomeTax = taxCash;
      point.cashFlow = cashFlow;
      points.push(point);
      if (!first) first = point;
      if (m < 12) {
        firstYearCash += cashFlow;
        firstYearTax += taxCash;
        firstYearDep += dep;
      }
    }

    var last = points[points.length - 1];
    var cross = null;
    var i;
    for (i = 0; i < points.length; i++) {
      if (points[i].rentalReal > points[i].stockReal) {
        cross = points[i].month;
        break;
      }
    }

    return {
      input: spec,
      points: points,
      first: first,
      loan: loan0,
      payment: payment,
      closing: closing,
      basis: basis,
      depreciable: depreciable,
      stockTypical: stockTypical,
      totals: {
        interest: totalInterest,
        pmiMonths: pmiMonths,
        pmiStopMonth: pmiStopMonth,
        firstYearCash: firstYearCash,
        firstYearTax: firstYearTax,
        firstYearDep: firstYearDep,
        allowance: passiveAllowance(spec.income),
        crossoverMonth: cross,
        endsAhead: last.rentalReal > last.stockReal
      }
    };
  }

  function marketRent(yieldRate, anchor, price) {
    if (!(price > 0) || !(yieldRate > 0)) return 0;
    var base = anchor > 0 ? anchor : price;
    return (base * yieldRate / 12) * Math.pow(price / base, RENT_ELASTICITY);
  }

  function scaledRent(rent, fromPrice, toPrice) {
    if (!(toPrice > 0) || !(fromPrice > 0) || !(rent > 0)) return 0;
    return rent * Math.pow(toPrice / fromPrice, RENT_ELASTICITY);
  }

  function atPrice(input, price) {
    var spec = normalize(input);
    var next = price > 0 ? price : 0;
    return normalize({
      exit: spec.exit,
      price: next,
      downPayment: spec.price > 0 ? spec.downPayment * next / spec.price : spec.downPayment,
      annualRate: spec.annualRate,
      years: spec.years,
      horizonYears: spec.horizonYears,
      propertyTaxRate: spec.propertyTaxRate,
      taxGrowth: spec.taxGrowth,
      insuranceYear: spec.price > 0 ? spec.insuranceYear * next / spec.price : spec.insuranceYear,
      maintenanceRate: spec.maintenanceRate,
      hoaMonth: spec.hoaMonth,
      pmiRate: spec.pmiRate,
      closingCostRate: spec.closingCostRate,
      sellingCostRate: spec.sellingCostRate,
      homeAppreciation: spec.homeAppreciation,
      stockReturn: spec.stockReturn,
      stockVol: spec.stockVol,
      rentGrowth: spec.rentGrowth,
      investmentDrag: spec.investmentDrag,
      inflation: spec.inflation,
      rentMonth: scaledRent(spec.rentMonth, spec.price, next),
      vacancyRate: spec.vacancyRate,
      managementRate: spec.managementRate,
      landFraction: spec.landFraction,
      filingStatus: spec.filingStatus,
      income: spec.income,
      stateCode: spec.stateCode,
      cityName: spec.cityName
    });
  }

  root.RentalModel = {
    normalize: normalize,
    project: project,
    atPrice: atPrice,
    marketRent: marketRent,
    scaledRent: scaledRent,
    RENT_ELASTICITY: RENT_ELASTICITY,
    mortgagePayment: mortgagePayment,
    passiveAllowance: passiveAllowance,
    saleTax: saleTax
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
