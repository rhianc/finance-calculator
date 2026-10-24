(function () {
  'use strict';

  var MONEY_IDS = ['home-price', 'down-amt', 'insurance', 'hoa', 'rent', 'income', 'other-salt', 'other-itemized'];
  var COLORS = {
    'Principal & interest': '#1f4b82',
    'Property tax': '#3f6f54',
    'Insurance': '#a65b2b',
    'Maintenance': '#6b625b',
    'HOA': '#7a5b78',
    'PMI': '#8a5a44'
  };

  function $(id) { return document.getElementById(id); }

  function parseNum(value) {
    var n = parseFloat(String(value).replace(/,/g, ''));
    return isFinite(n) ? n : 0;
  }

  function readNum(id) { return parseNum($(id).value); }

  function formatNumber(n, digits) {
    return (isFinite(n) ? n : 0).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  // Commas while the field is being edited. The caret stays on the same digit.
  function formatMoneyLive(el) {
    var raw = el.value;
    var caret = el.selectionStart == null ? raw.length : el.selectionStart;
    var sigBefore = raw.slice(0, caret).replace(/[^\d.]/g, '').length;
    var cleaned = raw.replace(/[^\d.]/g, '');
    var dot = cleaned.indexOf('.');
    var intDigits = dot === -1 ? cleaned : cleaned.slice(0, dot);
    var frac = dot === -1 ? '' : cleaned.slice(dot + 1).replace(/\./g, '');
    intDigits = intDigits.replace(/^0+(?=\d)/, '');
    var grouped = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (!grouped && dot !== -1) grouped = '0';
    var next = grouped + (dot === -1 ? '' : '.' + frac);
    if (next === raw) return;
    el.value = next;
    var seen = 0;
    var pos = 0;
    while (pos < next.length && seen < sigBefore) {
      if (/[\d.]/.test(next.charAt(pos))) seen += 1;
      pos += 1;
    }
    var place = function () {
      if (document.activeElement !== el || el._fmtGen !== gen) return;
      try { el.setSelectionRange(pos, pos); } catch (err) {}
    };
    el._fmtGen = (el._fmtGen || 0) + 1;
    var gen = el._fmtGen;
    place();
    requestAnimationFrame(place);
  }

  function money(n, digits) {
    var d = digits == null ? 0 : digits;
    var neg = n < 0;
    return (neg ? '−$' : '$') + formatNumber(Math.abs(n), d);
  }

  function formatDuration(months) {
    var y = Math.floor(months / 12);
    var m = months % 12;
    var ys = y === 1 ? '1 year' : y + ' years';
    var ms = m === 1 ? '1 month' : m + ' months';
    if (y === 0) return ms;
    if (m === 0) return ys;
    return ys + ', ' + ms;
  }

  function setMoney(id, n) {
    $(id).value = formatNumber(Math.max(0, Math.round(n)), 0);
  }

  function syncDownFromPct() {
    var price = readNum('home-price');
    var pct = Math.min(100, Math.max(0, readNum('down-pct')));
    setMoney('down-amt', price * pct / 100);
  }

  function marketCode() {
    var value = $('state').value;
    if (value === 'US') return 'US';
    if (value.indexOf('CA') === 0) return 'CA';
    return value;
  }

  function buildStates() {
    var sel = $('state');
    var current = sel.value || 'CA';
    sel.replaceChildren();
    HomeMarkets.options().forEach(function (opt) {
      var el = document.createElement('option');
      el.value = opt.id;
      el.textContent = opt.label;
      if (opt.taxRate != null) el.setAttribute('data-rate', opt.taxRate.toFixed(2));
      el.setAttribute('data-growth', opt.taxGrowth);
      sel.appendChild(el);
    });
    sel.value = current;
    if (!sel.value) sel.value = 'CA';
  }

  function fillCities() {
    var sel = $('city');
    var prev = sel.value;
    var cities = HomeMarkets.cities(marketCode());
    sel.replaceChildren();
    var statewide = document.createElement('option');
    statewide.value = '';
    statewide.textContent = cities.length ? 'Statewide' : 'Statewide only';
    sel.appendChild(statewide);
    cities.forEach(function (city) {
      var opt = document.createElement('option');
      opt.value = city.id;
      opt.textContent = city.name;
      opt.title = city.fhfa;
      sel.appendChild(opt);
    });
    var found = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === prev) found = true;
    }
    sel.value = found ? prev : '';
  }

  function isAuto(id) {
    var el = $(id);
    return !el || el.value !== 'custom';
  }

  function showCustom(fieldId, on) {
    var field = $(fieldId);
    if (!field) return;
    if (on) field.removeAttribute('hidden');
    else field.setAttribute('hidden', '');
  }

  function syncModeVisibility() {
    showCustom('home-app-field', !isAuto('home-app-mode'));
    showCustom('salt-field', !isAuto('salt-mode'));
    showCustom('down-field', !isAuto('down-mode'));
    showCustom('tax-rate-field', !isAuto('tax-rate-mode'));
    showCustom('insurance-field', !isAuto('insurance-mode'));
  }

  function autoOption(id) {
    return $(id).querySelector('option[value="auto"]');
  }

  function applyAppreciation() {
    var place = HomeMarkets.place(marketCode(), $('city').value);
    if (!place) return;
    var name = place.kind === 'city' ? place.city.name : place.state.name;
    autoOption('home-app-mode').textContent = name + ' history, ' + place.rate.toFixed(2) + '%';
    if (isAuto('home-app-mode')) $('home-app').value = place.rate.toFixed(2);
  }

  function cityName() {
    var sel = $('city');
    var opt = sel.selectedOptions[0];
    return opt && sel.value ? opt.textContent : '';
  }

  function applyStateTax() {
    var bill = TaxRules.saltBill(marketCode(), $('filing').value, Math.max(0, readNum('income')), cityName());
    autoOption('salt-mode').textContent = 'Estimated, ' + money(bill);
    if (isAuto('salt-mode')) setMoney('other-salt', bill);
  }

  function applyInsurance() {
    var place = HomeMarkets.place(marketCode(), $('city').value);
    if (!place || !(place.ins > 0)) return;
    var price = Math.max(0, readNum('home-price'));
    var annual = price * place.ins / HomeMarkets.DWELLING;
    autoOption('insurance-mode').textContent = 'Insurify, ' + money(annual);
    if (isAuto('insurance-mode')) setMoney('insurance', annual);
  }

  function applyPropertyTax() {
    var opt = $('state').selectedOptions[0];
    var preset = opt && opt.getAttribute('data-rate');
    var growth = opt && opt.getAttribute('data-growth');
    if (preset) {
      autoOption('tax-rate-mode').textContent = 'State preset, ' + preset + '%';
      if (isAuto('tax-rate-mode')) $('tax-rate').value = preset;
    } else {
      autoOption('tax-rate-mode').textContent = 'No state preset';
    }
    if (growth) autoOption('tax-growth').setAttribute('data-growth', growth);
  }

  function applyDown() {
    var price = readNum('home-price');
    var pct = Math.min(100, Math.max(0, readNum('down-pct')));
    var amt = price * pct / 100;
    autoOption('down-mode').textContent = 'From the percent, ' + money(amt);
    if (isAuto('down-mode')) setMoney('down-amt', amt);
  }

  function syncPctFromAmt() {
    var price = readNum('home-price');
    var down = Math.max(0, readNum('down-amt'));
    if (price > 0 && down > price) {
      down = price;
      setMoney('down-amt', down);
    }
    $('down-pct').value = price > 0 ? formatNumber(down / price * 100, 1) : '0';
  }

  function readInputs() {
    return {
      price: Math.max(0, readNum('home-price')),
      downPayment: Math.max(0, readNum('down-amt')),
      annualRate: readNum('loan-rate') / 100,
      years: readNum('loan-years'),
      horizonYears: readNum('horizon'),
      propertyTaxRate: readNum('tax-rate') / 100,
      taxGrowth: (function () {
        var sel = $('tax-growth');
        if (sel.value !== 'auto') return sel.value;
        return autoOption('tax-growth').getAttribute('data-growth') || 'market';
      })(),
      insuranceYear: Math.max(0, readNum('insurance')),
      maintenanceRate: readNum('maintenance') / 100,
      hoaMonth: Math.max(0, readNum('hoa')),
      pmiRate: readNum('pmi-rate') / 100,
      closingCostRate: readNum('closing') / 100,
      sellingCostRate: readNum('selling') / 100,
      homeAppreciation: readNum('home-app') / 100,
      stockReturn: readNum('stock-return') / 100,
      investmentDrag: readNum('drag') / 100,
      inflation: readNum('inflation') / 100,
      rentMonth: Math.max(0, readNum('rent')),
      filingStatus: $('filing').value,
      otherSalt: Math.max(0, readNum('other-salt')),
      otherItemized: Math.max(0, readNum('other-itemized')),
      income: Math.max(0, readNum('income')),
      stateCode: marketCode(),
      cityName: cityName()
    };
  }

  function step(expr, value) {
    var row = document.createElement('div');
    row.className = 'step';
    var left = document.createElement('div');
    left.className = 'expr';
    left.textContent = expr;
    var right = document.createElement('div');
    right.className = 'val';
    right.textContent = value;
    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  function renderBreakdown(first) {
    var host = $('breakdown');
    host.replaceChildren();
    var items = [
      ['Principal & interest', first.interest + first.principal],
      ['Property tax', first.propertyTax],
      ['Insurance', first.insurance],
      ['Maintenance', first.maintenance],
      ['HOA', first.hoa],
      ['PMI', first.pmi]
    ];
    var slices = [];
    items.forEach(function (item) {
      if (item[1] < 0.5 && item[0] !== 'Principal & interest') return;
      var row = document.createElement('div');
      row.className = 'rowline';
      var swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = COLORS[item[0]];
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = item[0];
      var amt = document.createElement('span');
      amt.className = 'amt';
      amt.textContent = money(item[1], 2);
      row.appendChild(swatch);
      row.appendChild(name);
      row.appendChild(amt);
      host.appendChild(row);
      if (item[1] >= 0.5) slices.push({ label: item[0], value: item[1], color: COLORS[item[0]] });
    });
    return slices;
  }

  function renderWorked(result) {
    var first = result.first;
    var host = $('worked');
    host.replaceChildren();
    if (!first) return;
    var rText = first.r.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    var lines = [
      ['Loan  P = price − down payment', money(first.loan)],
      ['Monthly rate  r = ' + (result.input.annualRate * 100).toFixed(2) + '% / 12', rText],
      ['Payments  N', String(first.n)],
      [first.r === 0 ? 'Payment  M = P / N' : 'Payment  M = P × [r(1+r)^N] / [(1+r)^N − 1]', money(first.payment, 2)],
      ['Interest  = P × r', money(first.interest, 2)],
      ['Principal  = M − interest', money(first.principal, 2)],
      ['Property tax this month', money(first.propertyTax, 2)],
      ['Insurance  = annual premium / 12', money(first.insurance, 2)],
      ['Maintenance  = price × rate / 12', money(first.maintenance, 2)],
      ['Deductible interest  = interest × min(1, ' + money(first.debtCap) + ' / balance)', money(first.deductibleInterest, 2)],
      ['Housing deductions so far this year', money(first.ytdHousing, 2)],
      ['Standard deduction', money(first.standardDeduction)],
      ['Federal tax saved this month', money(first.federalSavings, 2)],
      ['State tax saved this month', money(first.stateSavings, 2)],
      ['Owner cash this month  O', money(first.ownerOutlay, 2)],
      ['Rent this month  R', money(first.rent, 2)],
      ['Added to the renter portfolio  O − R', money(first.renterDeposit, 2)],
      ['Added to the owner tax portfolio  τ', money(first.savings, 2)]
    ];
    lines.forEach(function (line) { host.appendChild(step(line[0], line[1])); });
  }

  function renderYears(points) {
    var body = $('year-body');
    body.replaceChildren();
    var last = points[points.length - 1].month;
    var marks = [0, 60, 120, 180, 240, 300, 360];
    var seen = {};
    marks.push(last);
    marks.forEach(function (month) {
      if (month > last || seen[month]) return;
      seen[month] = true;
      var point = points[month];
      if (!point) return;
      var gap = point.houseReal - point.rentReal;
      var tr = document.createElement('tr');
      [ (month / 12).toString(), money(point.houseReal), money(point.rentReal), money(gap) ].forEach(function (text, index) {
        var td = document.createElement('td');
        td.textContent = text;
        if (index === 3) td.className = gap >= 0 ? 'pos' : 'neg';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function filingLabel(status) {
    return status === 'single' ? 'Single' : 'Married filing jointly';
  }

  function rateText(rate) {
    var pct = rate * 100;
    var digits = Math.abs(pct * 10 - Math.round(pct * 10)) < 0.05 ? 1 : 2;
    return formatNumber(pct, digits);
  }

  function taxCopy(input) {
    var profile = TaxRules.profile(input.stateCode, input.filingStatus, input.income, input.cityName);
    var place = HomeMarkets.place(input.stateCode, '');
    var where = input.cityName || (place ? place.state.name : 'this state');
    var federal = rateText(profile.federalMarginal);
    var stateRate = rateText(profile.stateMarginal);
    var expected = profile.stateTax;
    var overridden = Math.abs(input.otherSalt - expected) > 1;
    var lead;
    if (input.stateCode === 'US') {
      lead = 'The national average is not a state, so no state income tax is applied.';
    } else if (input.stateCode === 'WA') {
      lead = 'Washington has no wage tax, and its capital-gains tax does not apply to a home sale.';
    } else if (profile.stateTax < 1 && profile.stateMarginal < 0.0005) {
      lead = where + ' has no income tax.';
    } else {
      lead = 'A dollar of deductible interest saves ' + stateRate + '% here. State and local income tax is about ' + money(expected) + ' a year.';
    }
    var who = input.filingStatus === 'single' ? 'A single filer' : 'A joint return';
    var hint = who + ' at ' + money(input.income) + ' is in the ' + federal + '% federal bracket. ' + lead;
    hint += ' Brackets stay at 2026 levels, and this income does not rise with inflation.';
    return {
      summary: 'Tax rules · ' + money(input.income) + ' · ' + filingLabel(input.filingStatus) + ' · ' + federal + '% federal · ' + stateRate + '% on interest',
      hint: hint,
      override: isAuto('salt-mode')
        ? ''
        : 'Custom state tax. Choose the estimate in the menu to use it again.'
    };
  }

  function insuranceNote(price) {
    var place = HomeMarkets.place(marketCode(), $('city').value);
    if (!place || !(place.ins > 0)) return '';
    var where = place.code === 'US' ? 'the U.S.' : (place.insFrom === 'city' ? place.city.name : place.state.name);
    if (!isAuto('insurance-mode')) {
      return 'Custom premium. Choose Insurify in the menu to use the average again.';
    }
    var scope = place.insFrom === 'city' || place.code === 'US' ? '' : ' statewide';
    return 'Insurance is the Insurify average for ' + where + scope + ', ' + money(place.ins) + ' a year on $300,000 of dwelling coverage, scaled to this price. A $1,000 deductible. Flood is not included.';
  }

  function refresh() {
    var input = readInputs();
    var price = input.price;
    var maint = price * input.maintenanceRate;
    $('tax-hint').textContent = {
      prop13: 'Assessed value starts at the purchase price and rises with inflation, capped at 2% a year. A new California bill is often about 1.1% to 1.3% after local bonds. The 0.71% statewide figure is lower because longtime owners are taxed on old assessments.',
      market: 'The bill grows with the home value, so this effective rate stays constant. States that were already on the list keep their previous presets. The others use the Census ACS 2024 effective rate on owner-occupied homes. Choose Custom to match the parcel.',
      inflation: 'The bill grows with inflation and does not follow home appreciation.'
    }[input.taxGrowth];
    var stateOpt = $('state').selectedOptions[0];
    if (stateOpt && !stateOpt.getAttribute('data-rate')) {
      $('tax-hint').textContent = 'No property-tax preset for this place. Choose Custom and enter the parcel rate.';
    }
    $('cost-hint').textContent = 'About ' + money(maint) + ' a year of maintenance at this price, before inflation. ' + insuranceNote(input.price);

    var result = FinanceModel.project(input);
    var first = result.first;
    if (!first) return;

    $('res-total').textContent = money(first.ownerOutlay, 2);
    $('res-sub').textContent = 'Cash cost of owning this month. Tax savings are separate: ' + money(first.savings, 2) + ' this month.';
    var slices = renderBreakdown(first);
    $('res-loan').textContent = money(first.loan);
    $('res-interest').textContent = money(result.totals.interest);
    $('res-tax-year').textContent = money(result.totals.firstYearSavings);
    if (result.totals.pmiMonths === 0) {
      $('res-pmi').textContent = 'None';
    } else if (result.totals.pmiStopMonth) {
      $('res-pmi').textContent = 'Drops off after ' + formatDuration(result.totals.pmiMonths);
    } else {
      $('res-pmi').textContent = 'Through the horizon';
    }
    var fed = result.totals.firstYearFederal;
    var state = result.totals.firstYearState;
    $('res-note').textContent = 'First-year tax savings are ' + money(fed) + ' federal and ' + money(state) + ' state. Federal savings show up only after housing deductions pass the ' + money(first.standardDeduction) + ' standard deduction, so month one is often just the state piece. Insurance, maintenance, HOA, and the tax bill step up later. This payment is year one.';

    var last = result.points[result.points.length - 1];
    var gap = last.houseReal - last.rentReal;
    var cross = result.totals.crossoverMonth;
    $('stat-cross').textContent = cross == null ? 'Not within ' + Math.round(last.month / 12) + ' years' : (cross === 0 ? 'From the start' : formatDuration(cross));
    $('stat-gap').textContent = (gap >= 0 ? 'Buying +' : 'Renting +') + money(Math.abs(gap));
    $('stat-gap').className = 'v ' + (gap >= 0 ? 'pos' : 'neg');
    $('stat-end').textContent = money(last.houseReal);
    var horizonYears = Math.round(last.month / 12);
    var note = 'At ' + horizonYears + ' years, buying is ' + money(last.houseReal) + ' and renting is ' + money(last.rentReal) + ', in today\'s dollars.';
    if (cross != null && !result.totals.endsAhead) {
      note += ' Buying leads at ' + formatDuration(cross) + ', then finishes behind.';
    }
    if (input.rentMonth === 0) {
      note += ' Rent is $0, so the renter invests the entire cost of owning.';
    }
    $('stat-note').textContent = note;

    var taxes = taxCopy(input);
    $('tax-summary').textContent = taxes.summary;
    $('income-hint').textContent = taxes.hint;
    $('tax-readout').textContent = taxes.override;

    var place = HomeMarkets.place(marketCode(), $('city').value);
    var typed = input.homeAppreciation * 100;
    var matched = place && Math.abs(typed - place.rate) < 0.005;
    if (!isAuto('home-app-mode')) {
      $('app-hint').textContent = 'Custom rate. Choose the place history in the menu to use it again.';
    } else if (!place) {
      $('app-hint').textContent = '';
    } else if (matched && place.kind === 'city') {
      $('app-hint').textContent = place.city.name + ' compounded at ' + place.rate.toFixed(2) + '% a year from 1991 Q1 to 2026 Q2. ' + place.state.name + ' statewide was ' + place.state.rate.toFixed(2) + '%. FHFA purchase-only index, nominal. This includes the bust and the 2020–22 spike, and it is not a forecast.';
    } else if (matched) {
      var cityCount = HomeMarkets.cities(place.code).length;
      var cityNote = cityCount ? ' Pick a city to use that metro instead.' : ' None of the FHFA top-100 metros are based in this state.';
      $('app-hint').textContent = place.state.name + ' compounded at ' + place.rate.toFixed(2) + '% a year from 1991 Q1 to 2026 Q2. FHFA purchase-only index, nominal. This includes the bust and the 2020–22 spike, and it is not a forecast.' + cityNote;
    }

    renderYears(result.points);
    renderWorked(result);
    FinanceCharts.renderPie($('pieChart'), slices);
    FinanceCharts.renderLines($('wealthChart'), result.points);
    FinanceCharts.renderCrossover(input);
  }

  function onEdit(event) {
    var id = event.target.id;
    if (MONEY_IDS.indexOf(id) !== -1 && event.type === 'input') formatMoneyLive(event.target);
    if (id === 'state') {
      fillCities();
      applyAppreciation();
      applyInsurance();
      applyStateTax();
      applyPropertyTax();
    } else if (id === 'city') {
      applyAppreciation();
      applyInsurance();
      applyStateTax();
    } else if (id === 'income' || id === 'filing') {
      applyStateTax();
    } else if (id === 'down-pct') {
      applyDown();
    } else if (id === 'home-price') {
      if (!isAuto('down-mode')) syncPctFromAmt();
      applyDown();
      applyInsurance();
    } else if (id === 'down-amt') {
      syncPctFromAmt();
      applyDown();
    } else if (id === 'home-app-mode') {
      applyAppreciation();
      syncModeVisibility();
    } else if (id === 'salt-mode') {
      applyStateTax();
      syncModeVisibility();
    } else if (id === 'insurance-mode') {
      applyInsurance();
      syncModeVisibility();
    } else if (id === 'tax-rate-mode') {
      applyPropertyTax();
      syncModeVisibility();
    } else if (id === 'down-mode') {
      applyDown();
      syncModeVisibility();
    }
    refresh();
  }

  document.body.addEventListener('input', onEdit);
  document.body.addEventListener('change', onEdit);

  MONEY_IDS.forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('blur', function () {
      if (!el.value.trim()) return;
      var digits = 0;
      el.value = formatNumber(Math.max(0, parseNum(el.value)), digits);
      refresh();
    });
  });

  var derivation = $('derivation');
  derivation.addEventListener('toggle', function () {
    if (!derivation.open) return;
    FinanceCharts.renderScale($('scaleChart'));
    FinanceCharts.resizeScale();
  });

  function boot() {
    buildStates();
    fillCities();
    try { applyAppreciation(); } catch (err) { console.error(err); }
    try { applyInsurance(); } catch (err) { console.error(err); }
    try { applyStateTax(); } catch (err) { console.error(err); }
    try { applyPropertyTax(); } catch (err) { console.error(err); }
    try { applyDown(); } catch (err) { console.error(err); }
    syncModeVisibility();
    refresh();
  }

  boot();
})();
