(function () {
  'use strict';

  var MONEY_IDS = ['down-amt', 'insurance', 'hoa', 'income', 'other-salt', 'other-itemized'];
  var COLORS = {
    'Principal & interest': '#c4a574',
    'Property tax': '#7d9a86',
    'Insurance': '#d08a62',
    'Maintenance': '#a39e94',
    'HOA': '#8d9a93',
    'PMI': '#b08968'
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

  function applyAppreciation() {
    var place = HomeMarkets.place(marketCode(), $('city').value);
    if (!place) return;
    $('home-app').value = place.rate.toFixed(2);
  }

  function cityName() {
    var sel = $('city');
    var opt = sel.selectedOptions[0];
    return opt && sel.value ? opt.textContent : '';
  }

  function applyStateTax() {
    var bill = TaxRules.saltBill(marketCode(), $('filing').value, Math.max(0, readNum('income')), cityName());
    setMoney('other-salt', bill);
  }

  function applyInsurance() {
    var place = HomeMarkets.place(marketCode(), $('city').value);
    if (!place || !(place.ins > 0)) return;
    var price = Math.max(0, readNum('home-price'));
    setMoney('insurance', price * place.ins / HomeMarkets.DWELLING);
  }

  function applyPropertyTax() {
    var opt = $('state').selectedOptions[0];
    if (!opt) return;
    var preset = opt.getAttribute('data-rate');
    var growth = opt.getAttribute('data-growth');
    if (preset) $('tax-rate').value = preset;
    if (growth) $('tax-growth').value = growth;
  }

  function syncPctFromAmt() {
    var price = readNum('home-price');
    var down = Math.max(0, readNum('down-amt'));
    if (price > 0 && down > price) {
      down = price;
      setMoney('down-amt', down);
    }
    $('down-pct').value = price > 0 ? String(Math.round(down / price * 100)) : '0';
    paintSlider($('down-pct'));
  }

  function readInputs() {
    return {
      price: Math.max(0, readNum('home-price')),
      downPayment: Math.max(0, readNum('down-amt')),
      annualRate: readNum('loan-rate') / 100,
      years: readNum('loan-years'),
      horizonYears: readNum('horizon'),
      propertyTaxRate: readNum('tax-rate') / 100,
      taxGrowth: $('tax-growth').value,
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
      ['Loan, price minus down payment', money(first.loan)],
      ['Monthly rate, ' + (result.input.annualRate * 100).toFixed(2) + '% / 12', rText],
      ['Payments', String(first.n)],
      [first.r === 0 ? 'Payment, loan divided by the number of payments' : 'Payment, standard fixed-rate formula', money(first.payment, 2)],
      ['Interest, balance times the monthly rate', money(first.interest, 2)],
      ['Principal, payment minus interest', money(first.principal, 2)],
      ['Property tax this month', money(first.propertyTax, 2)],
      ['Insurance, annual premium divided by 12', money(first.insurance, 2)],
      ['Maintenance, price times the rate, divided by 12', money(first.maintenance, 2)],
      ['Deductible interest, interest times min(1, ' + money(first.debtCap) + ' / balance)', money(first.deductibleInterest, 2)],
      ['Housing deductions so far this year', money(first.ytdHousing, 2)],
      ['Standard deduction', money(first.standardDeduction)],
      ['Federal tax saved this month', money(first.federalSavings, 2)],
      ['State tax saved this month', money(first.stateSavings, 2)],
      ['Owner cash this month', money(first.ownerOutlay, 2)],
      ['Rent this month', money(first.rent, 2)],
      ['Added to the renter portfolio, owner cash minus rent', money(first.renterDeposit, 2)],
      ['Added to the owner tax portfolio', money(first.savings, 2)]
    ];
    lines.forEach(function (line) { host.appendChild(step(line[0], line[1])); });
  }

  function renderYears(points) {
    var body = $('year-body');
    if (!body) return;
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
      var surplus = gap === 0 ? 'Even' : (gap > 0 ? 'Buying ' : 'Renting ') + money(Math.abs(gap));
      [ (month / 12).toString(), surplus ].forEach(function (text, index) {
        var td = document.createElement('td');
        td.textContent = text;
        if (index === 1 && gap !== 0) td.className = gap > 0 ? 'pos' : 'neg';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function rateText(rate) {
    var pct = rate * 100;
    var digits = Math.abs(pct * 10 - Math.round(pct * 10)) < 0.05 ? 1 : 2;
    return formatNumber(pct, digits);
  }

  function taxCopy(input) {
    var profile = TaxRules.profile(input.stateCode, input.filingStatus, input.income, input.cityName);
    var federal = rateText(profile.federalMarginal);
    var stateRate = rateText(profile.stateMarginal);
    var expected = profile.stateTax;
    var overridden = Math.abs(input.otherSalt - expected) > 1;
    var lead;
    if (input.stateCode === 'US') {
      lead = 'No state income tax.';
    } else if (input.stateCode === 'WA') {
      lead = 'No wage tax. The capital-gains tax skips a home sale.';
    } else if (profile.stateTax < 1 && profile.stateMarginal < 0.0005) {
      lead = 'No income tax.';
    } else {
      lead = 'State tax about ' + money(expected) + '. Interest saves ' + stateRate + '% here.';
    }
    var filing = input.filingStatus === 'single' ? 'single' : 'joint';
    var hint = federal + '% federal, ' + filing + '. ' + lead;
    return {
      summary: '',
      hint: hint,
      override: overridden
        ? 'Using ' + money(input.otherSalt) + ' instead of the ' + money(expected) + ' estimate.'
        : ''
    };
  }

  function insuranceNote(price) {
    var place = HomeMarkets.place(marketCode(), $('city').value);
    if (!place || !(place.ins > 0)) return '';
    var expected = price * place.ins / HomeMarkets.DWELLING;
    var where = place.code === 'US' ? 'the U.S.' : (place.insFrom === 'city' ? place.city.name : place.state.name);
    if (Math.abs(readNum('insurance') - expected) > 1) {
      return 'Using your premium instead of the ' + money(expected) + ' Insurify average.';
    }
    var scope = place.insFrom === 'city' || place.code === 'US' ? '' : ' statewide';
    return 'Insurify for ' + where + scope + ', scaled from ' + money(place.ins) + ' on a $300,000 home. No flood.';
  }


  function paintSurplus(el, label, amount, tone) {
    el.className = 'surplus' + (tone ? ' ' + tone : '');
    var k = document.createElement('span');
    k.className = 'surplus-k';
    k.textContent = label;
    var v = document.createElement('span');
    v.className = 'surplus-v';
    v.textContent = amount;
    el.replaceChildren(k, v);
  }

  function refresh(fast) {
    if (window.RedfinLink) RedfinLink.paint();
    var input = readInputs();
    if (!fast) $('tax-hint').textContent = {
      prop13: 'Starts at the purchase price and rises with inflation, capped at 2% a year.',
      market: 'Grows with the home value. Edit the rate to match the parcel.',
      inflation: 'Grows with inflation, not the home value.'
    }[input.taxGrowth];
    var stateOpt = $('state').selectedOptions[0];
    if (stateOpt && !stateOpt.getAttribute('data-rate')) {
      $('tax-hint').textContent = 'No preset for this place. Enter the parcel rate.';
    }
    $('cost-hint').textContent = insuranceNote(input.price);

    var result = FinanceModel.project(input);
    var first = result.first;
    if (!first) return;

    $('res-total').textContent = money(first.ownerOutlay, 2);
    $('res-sub').textContent = 'Before ' + money(first.savings, 2) + ' of tax savings.';
    var slices = renderBreakdown(first);
    $('res-loan').textContent = money(first.loan);
    $('res-interest').textContent = money(result.totals.interest);
    if (result.totals.pmiMonths === 0) {
      $('res-pmi').textContent = 'None';
    } else if (result.totals.pmiStopMonth) {
      $('res-pmi').textContent = 'Drops off after ' + formatDuration(result.totals.pmiMonths);
    } else {
      $('res-pmi').textContent = 'Through the horizon';
    }
    var fed = result.totals.firstYearFederal;
    var state = result.totals.firstYearState;
    $('res-note').textContent = money(fed) + ' federal and ' + money(state) + ' state in tax savings the first year.';

    var last = result.points[result.points.length - 1];
    var gap = last.houseReal - last.rentReal;
    var years = Math.round(last.month / 12);
    var gapEl = $('stat-gap');
    if (gapEl) paintSurplus(
      gapEl,
      gap === 0 ? 'Even' : (gap > 0 ? 'Buying surplus' : 'Renting surplus'),
      gap === 0 ? ('At ' + years + (years === 1 ? ' year' : ' years')) : money(Math.abs(gap)),
      gap > 0 ? 'pos' : gap < 0 ? 'neg' : ''
    );
    var cross = result.totals.crossoverMonth;
    var note = '';
    if (cross != null && !result.totals.endsAhead) {
      note = 'Buying leads at ' + formatDuration(cross) + ', then falls behind.';
    }
    if (input.rentMonth === 0) {
      note += (note ? ' ' : '') + 'Rent is $0, so the whole cost of owning is invested.';
    }
    $('stat-note').textContent = note;
    $('stat-note').hidden = !note;

    var taxes = taxCopy(input);
    $('income-hint').textContent = taxes.hint;
    $('tax-readout').textContent = taxes.override;

    var place = HomeMarkets.place(marketCode(), $('city').value);
    var typed = input.homeAppreciation * 100;
    var matched = place && Math.abs(typed - place.rate) < 0.005;
    if (!place) {
      $('app-hint').textContent = '';
    } else if (matched && place.kind === 'city') {
      $('app-hint').textContent = place.city.name + ', ' + place.rate.toFixed(2) + '% a year since 1991. Statewide was ' + place.state.rate.toFixed(2) + '%.';
    } else if (matched) {
      $('app-hint').textContent = place.state.name + ', ' + place.rate.toFixed(2) + '% a year since 1991. Not a forecast.';
    } else {
      var label = place.kind === 'city' ? place.city.name : place.state.name;
      $('app-hint').textContent = formatNumber(typed, 2) + '% instead of the ' + place.rate.toFixed(2) + '% history for ' + label + '.';
    }

    FinanceCharts.renderLines($('wealthChart'), result.points);
    FinanceCharts.renderPie($('pieChart'), slices);
    if (fast) {
      scheduleCrossover(input);
      return;
    }

    renderYears(result.points);
    renderWorked(result);
    crossJob = null;
    FinanceCharts.renderCrossover(input);
  }

  var crossJob = null;
  var crossBusy = false;
  function scheduleCrossover(input) {
    crossJob = input;
    if (crossBusy) return;
    crossBusy = true;
    function draw() {
      var job = crossJob;
      crossJob = null;
      if (job) {
        try { FinanceCharts.renderCrossover(job, true); } catch (err) {}
      }
      if (crossJob) requestAnimationFrame(draw);
      else crossBusy = false;
    }
    requestAnimationFrame(draw);
  }

  function paintSlider(el) {
    if (!el || el.type !== 'range') return;
    var min = parseFloat(el.min);
    var max = parseFloat(el.max);
    var val = parseFloat(el.value);
    var pct = max > min ? (val - min) / (max - min) : 0;
    var box = el.closest ? el.closest('.vrange') : null;
    if (box) box.style.setProperty('--fill', String(pct));
    var out = $(el.id + '-out');
    if (!out || document.activeElement === out) return;
    if (el.id === 'home-price') out.value = knobPrice(val);
    else if (el.id === 'rent') out.value = money(val, 0);
    else if (el.id === 'loan-rate') {
      out.value = (Math.round(val * 100) / 100) + '%';
    } else if (el.id === 'down-pct') out.value = Math.round(val) + '%';
  }

  function knobPrice(n) {
    var v = Math.round(n);
    if (v >= 1000000) {
      var m = Math.round(v / 100000) / 10;
      return '$' + (m === Math.round(m) ? String(Math.round(m)) : m.toFixed(1)) + 'M';
    }
    return '$' + Math.round(v / 1000) + 'k';
  }

  function paintSliders() {
    ['rent', 'loan-rate', 'home-price', 'down-pct'].forEach(function (id) { paintSlider($(id)); });
  }

  function setRange(id, n) {
    var el = $(id);
    if (!el) return;
    var min = parseFloat(el.min);
    var max = parseFloat(el.max);
    var step = parseFloat(el.step) || 1;
    var v = Math.min(max, Math.max(min, n));
    v = min + Math.round((v - min) / step) * step;
    el.value = String(Math.round(v * 1000) / 1000);
    paintSlider(el);
  }

  var SHARE = [
    { key: 'p', id: 'home-price', def: 500000 },
    { key: 'rent', id: 'rent', def: 3650 },
    { key: 'down', id: 'down-pct', def: 20 },
    { key: 'rate', id: 'loan-rate', def: 6.5 },
    { key: 'inc', id: 'income', def: 300000 },
    { key: 'file', id: 'filing', def: 'mfj', text: true },
    { key: 'st', id: 'state', def: 'CA', text: true },
    { key: 'city', id: 'city', def: '', text: true }
  ];

  function writeQuery() {
    var params = new URLSearchParams();
    SHARE.forEach(function (item) {
      var el = $(item.id);
      if (!el) return;
      var raw = item.text ? el.value : parseNum(el.value);
      var same = item.text ? raw === item.def : Math.abs(raw - item.def) < 0.001;
      if (!same && String(raw) !== '') params.set(item.key, item.text ? raw : String(raw));
    });
    var next = params.toString();
    if (next) next = 'share=1&' + next;
    var url = location.pathname + (next ? '?' + next : '') + location.hash;
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, '', url);
    document.querySelectorAll('.pages a').forEach(function (a) {
      var path = a.getAttribute('href').split('?')[0];
      a.setAttribute('href', path + (next ? '?' + next : ''));
    });
  }

  var queryTimer = 0;
  var sharpenTimer = 0;
  function scheduleQuery() {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(writeQuery, 300);
  }

  function applyQuery() {
    var q = new URLSearchParams(location.search);
    var shared = q.get('share') === '1';
    if (shared && q.has('st')) {
      $('state').value = q.get('st');
      if (!$('state').value) $('state').value = 'CA';
    }
    fillCities();
    if (!shared) return q;
    if (q.has('city')) {
      $('city').value = q.get('city');
      if ($('city').value !== q.get('city')) $('city').value = '';
    }
    if (q.has('p')) setRange('home-price', parseNum(q.get('p')));
    if (q.has('rent')) setRange('rent', parseNum(q.get('rent')));
    if (q.has('down')) setRange('down-pct', parseNum(q.get('down')));
    if (q.has('rate')) setRange('loan-rate', parseNum(q.get('rate')));
    if (q.has('inc')) setMoney('income', parseNum(q.get('inc')));
    if (q.get('file') === 'single' || q.get('file') === 'mfj') $('filing').value = q.get('file');
    return q;
  }

  function onEdit(event) {
    var id = event.target.id;
    var slider = event.target.type === 'range';
    if (!slider && MONEY_IDS.indexOf(id) !== -1 && event.type === 'input') formatMoneyLive(event.target);
    if (slider) paintSlider(event.target);
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
    } else if (id === 'down-pct' || id === 'home-price') {
      syncDownFromPct();
      if (id === 'home-price') applyInsurance();
    } else if (id === 'down-amt') {
      syncPctFromAmt();
    }
    if (slider && event.type === 'input') {
      refresh(true);
      return;
    }
    if (slider && event.type === 'change') {
      clearTimeout(sharpenTimer);
      sharpenTimer = setTimeout(function () { refresh(); }, 80);
      return;
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

  function bindKnobs() {
    document.querySelectorAll('.vrange').forEach(function (box) {
      var el = box.querySelector('input[type="range"]');
      if (!el) return;
      function valueFromY(clientY) {
        var rect = box.getBoundingClientRect();
        var pad = 14;
        var span = Math.max(1, rect.height - pad * 2);
        var t = (rect.bottom - pad - clientY) / span;
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        var min = parseFloat(el.min);
        var max = parseFloat(el.max);
        var step = parseFloat(el.step) || 1;
        var raw = min + t * (max - min);
        var v = min + Math.round((raw - min) / step) * step;
        if (v < min) v = min;
        if (v > max) v = max;
        return Math.round(v * 1000) / 1000;
      }
      function setFromEvent(event, commit) {
        var v = valueFromY(event.clientY);
        if (String(v) !== el.value) {
          el.value = String(v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (commit) el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      box.addEventListener('pointerdown', function (event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        box.setPointerCapture(event.pointerId);
        setFromEvent(event, false);
      });
      box.addEventListener('pointermove', function (event) {
        if (!box.hasPointerCapture(event.pointerId)) return;
        setFromEvent(event, false);
      });
      box.addEventListener('pointerup', function (event) {
        if (!box.hasPointerCapture(event.pointerId)) return;
        setFromEvent(event, true);
      });
    });
  }

  function boot() {
    buildStates();
    applyQuery();
    try { applyAppreciation(); } catch (err) { console.error(err); }
    try { applyInsurance(); } catch (err) { console.error(err); }
    try { applyStateTax(); } catch (err) { console.error(err); }
    try { applyPropertyTax(); } catch (err) { console.error(err); }
    try { syncDownFromPct(); } catch (err) { console.error(err); }
    paintSliders();
    if (window.KnobNums) {
      KnobNums.bind({
        commit: function (id, n) {
          setRange(id, n);
          var el = $(id);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        },
        paint: function (id) { paintSlider($(id)); }
      });
    }
    bindKnobs();
    refresh();
    writeQuery();
  }

  var copyBtn = $('copy-link');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      writeQuery();
      var done = function () {
        copyBtn.textContent = 'Copied';
        setTimeout(function () { copyBtn.textContent = 'Copy link'; }, 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(location.href).then(done, done);
      } else done();
    });
  }

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refresh);
  }

  boot();
})();
