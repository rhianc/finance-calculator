(function () {
  'use strict';

  var COLORS = {
    'Mortgage': '#c4a574',
    'Property tax': '#7d9a86',
    'Insurance': '#d08a62',
    'Maintenance': '#a39e94',
    'Management': '#8d9a93',
    'Vacancy': '#b08968',
    'HOA': '#cbb892',
    'PMI': '#b08968',
    'Cash left': '#8fbf9f'
  };
  var MONEY_IDS = ['home-price', 'rent', 'income', 'hoa', 'insurance', 'down-amt'];
  var HOUSE = '#2f6d52';
  var STOCK = '#b56a3c';
  var pieChart = null;
  var lineChart = null;

  function isDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

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
    el._fmtGen = (el._fmtGen || 0) + 1;
    var gen = el._fmtGen;
    var place = function () {
      if (document.activeElement !== el || el._fmtGen !== gen) return;
      try { el.setSelectionRange(pos, pos); } catch (err) {}
    };
    place();
    requestAnimationFrame(place);
  }

  function money(n, digits) {
    var d = digits == null ? 0 : digits;
    return (n < 0 ? '−$' : '$') + formatNumber(Math.abs(n), d);
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
      sel.appendChild(opt);
    });
    var found = false;
    for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === prev) found = true;
    sel.value = found ? prev : '';
  }

  function cityName() {
    var sel = $('city');
    var opt = sel.selectedOptions[0];
    return opt && sel.value ? opt.textContent : '';
  }

  function applyAppreciation() {
    var place = HomeMarkets.place(marketCode(), $('city').value);
    if (!place) return;
    $('home-app').value = place.rate.toFixed(2);
  }

  function applyInsurance() {
    var place = HomeMarkets.place(marketCode(), $('city').value);
    if (!place || !(place.ins > 0)) return;
    setMoney('insurance', Math.max(0, readNum('home-price')) * place.ins / HomeMarkets.DWELLING);
  }

  function applyRent() {
    var place = HomeMarkets.place(marketCode(), $('city').value);
    if (!place || !(place.grossYield > 0)) return;
    var price = Math.max(0, readNum('home-price'));
    setMoney('rent', RentalModel.marketRent(place.grossYield, place.yieldAnchor, price));
  }

  function applyPropertyTax() {
    var opt = $('state').selectedOptions[0];
    if (!opt) return;
    var preset = opt.getAttribute('data-rate');
    var growth = opt.getAttribute('data-growth');
    if (preset) $('tax-rate').value = preset;
    if (growth) $('tax-growth').value = growth;
  }

  function syncDownFromPct() {
    var price = readNum('home-price');
    var pct = Math.min(100, Math.max(0, readNum('down-pct')));
    setMoney('down-amt', price * pct / 100);
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
      vacancyRate: readNum('vacancy') / 100,
      managementRate: readNum('management') / 100,
      landFraction: readNum('land') / 100,
      filingStatus: $('filing').value,
      income: Math.max(0, readNum('income')),
      stateCode: marketCode(),
      cityName: cityName()
    };
  }

  function rateText(rate) {
    var pct = rate * 100;
    var digits = Math.abs(pct * 10 - Math.round(pct * 10)) < 0.05 ? 1 : 2;
    return formatNumber(pct, digits);
  }

  function renderBreakdown(first) {
    var host = $('breakdown');
    host.replaceChildren();
    var items = [
      ['Mortgage', first.payment],
      ['Property tax', first.propertyTax],
      ['Insurance', first.insurance],
      ['Maintenance', first.maintenance],
      ['Management', first.management],
      ['Vacancy', first.vacancy],
      ['HOA', first.hoa],
      ['PMI', first.pmi]
    ];
    if (first.cashFlow > 0.5) items.push(['Cash left', first.cashFlow]);
    var slices = [];
    items.forEach(function (item) {
      if (item[1] < 0.5) return;
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
      amt.textContent = money(item[1], 0);
      row.appendChild(swatch);
      row.appendChild(name);
      row.appendChild(amt);
      host.appendChild(row);
      slices.push({ label: item[0], value: item[1], color: COLORS[item[0]] });
    });
    return slices;
  }

  function renderYears(points) {
    var body = $('year-body');
    body.replaceChildren();
    var last = points[points.length - 1].month;
    var marks = [0, 60, 120, 180, 240, 300, 360, last];
    var seen = {};
    marks.forEach(function (month) {
      if (month > last || seen[month]) return;
      seen[month] = true;
      var point = points[month];
      if (!point) return;
      var gap = point.rentalReal - point.stockReal;
      var tr = document.createElement('tr');
      var surplus = gap === 0 ? 'Even' : (gap > 0 ? 'Rental ' : 'Stocks ') + money(Math.abs(gap));
      [(month / 12).toString(), surplus].forEach(function (text, index) {
        var td = document.createElement('td');
        td.textContent = text;
        if (index === 1 && gap !== 0) td.className = gap > 0 ? 'pos' : 'neg';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function renderPie(slices) {
    var dark = isDark();
    if (pieChart) pieChart.destroy();
    pieChart = null;
    var canvas = $('pieChart');
    if (!canvas || typeof Chart === 'undefined' || !slices.length) return;
    if (typeof Chart !== 'undefined') {
      Chart.defaults.color = dark ? '#b7aba2' : '#6b625b';
      Chart.defaults.borderColor = dark ? '#3c342e' : '#e4dcd0';
    }
    pieChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: slices.map(function (s) { return s.label; }),
        datasets: [{
          data: slices.map(function (s) { return s.value; }),
          backgroundColor: slices.map(function (s) { return s.color; }),
          borderWidth: 2,
          borderColor: isDark() ? '#1c1916' : '#fffdf8'
        }]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: { legend: { display: false } }
      }
    });
  }

  function renderLines(points) {
    var canvas = $('wealthChart');
    if (!canvas || typeof Chart === 'undefined') return;
    var dark = isDark();
    Chart.defaults.color = dark ? '#b7aba2' : '#6b625b';
    Chart.defaults.borderColor = dark ? '#3c342e' : '#e4dcd0';
    if (lineChart) lineChart.destroy();
    lineChart = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Rental, if sold',
            data: points.map(function (p) { return { x: p.month / 12, y: p.rentalReal }; }),
            borderColor: HOUSE,
            backgroundColor: HOUSE,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.15
          },
          {
            label: 'Stocks',
            data: points.map(function (p) { return { x: p.month / 12, y: p.stockReal }; }),
            borderColor: STOCK,
            backgroundColor: STOCK,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.15
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: {
            callbacks: {
              title: function (items) { return 'Year ' + items[0].parsed.x.toFixed(1); },
              label: function (ctx) { return ctx.dataset.label + ': ' + money(ctx.parsed.y); }
            }
          }
        },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Years' }, ticks: { maxTicksLimit: 8 } },
          y: {
            ticks: {
              maxTicksLimit: 6,
              callback: function (v) { return money(v); }
            }
          }
        }
      }
    });
  }

  function compactMoney(n) {
    var sign = n < 0 ? '−' : '';
    var abs = Math.abs(n);
    if (abs >= 1000000) {
      var millions = abs / 1000000;
      return sign + '$' + (millions >= 10 ? millions.toFixed(0) : millions.toFixed(1)) + 'M';
    }
    if (abs >= 1000) return sign + '$' + Math.round(abs / 1000) + 'k';
    return sign + '$' + Math.round(abs);
  }

  function renderCrossover(input) {
    var el = $('crossoverChart');
    if (!el || typeof Plotly === 'undefined') return;
    var dark = isDark();
    var horizon = Math.round(input.horizonYears * 12);
    function gapAtMonth(price, month) {
      var result = RentalModel.project(RentalModel.atPrice(input, price));
      var point = result.points[Math.min(month, result.points.length - 1)];
      return point.rentalReal - point.stockReal;
    }
    function evenAt(month) {
      var samples = [];
      var price;
      for (price = 50000; price <= 4000000; price += 250000) {
        samples.push({ price: price, gap: gapAtMonth(price, month) });
      }
      var i;
      for (i = 0; i < samples.length - 1; i++) {
        var g0 = samples[i].gap;
        var g1 = samples[i + 1].gap;
        if (!((g0 <= 0 && g1 > 0) || (g0 >= 0 && g1 < 0))) continue;
        var a = samples[i].price;
        var b = samples[i + 1].price;
        var ga = g0;
        var k;
        for (k = 0; k < 14; k++) {
          var mid = (a + b) / 2;
          var g = gapAtMonth(mid, month);
          if ((g > 0) === (ga > 0)) { a = mid; ga = g; }
          else b = mid;
        }
        return (a + b) / 2;
      }
      return null;
    }
    var marks = [];
    [0, Math.round(horizon / 2), horizon].forEach(function (month) {
      var even = evenAt(month);
      if (even > 0) marks.push(even);
    });
    if (input.price > 0) marks.push(input.price);
    var low;
    var high;
    if (!marks.length) {
      var mid = input.price > 0 ? input.price : 500000;
      low = mid * 0.6;
      high = mid * 1.5;
    } else {
      var loMark = Math.min.apply(null, marks);
      var hiMark = Math.max.apply(null, marks);
      var span = hiMark - loMark;
      if (span < loMark * 0.22) span = loMark * 0.22;
      if (span < 80000) span = 80000;
      var pad = span * 0.18;
      low = loMark - pad;
      high = hiMark + pad;
    }
    if (low < 0) low = 0;
    var rough = Math.max(high - low, 1) / 24;
    var pow = Math.pow(10, Math.floor(Math.log10(rough)));
    var unit = rough / pow;
    var step = (unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10) * pow;
    var prices = [];
    var p;
    for (p = Math.max(step, Math.ceil(low / step) * step); p <= high + step * 0.01; p += step) prices.push(Math.round(p));
    if (prices.length < 2) prices = [Math.round(step), Math.round(step * 2)];
    var years = [];
    var month;
    for (month = 0; month <= horizon; month++) years.push(month / 12);
    var z = [];
    var maxAbs = 0;
    var results = prices.map(function (price) { return RentalModel.project(RentalModel.atPrice(input, price)); });
    results.forEach(function (result) {
      var row = [];
      var t;
      for (t = 0; t <= horizon; t++) {
        var point = result.points[Math.min(t, result.points.length - 1)];
        var gap = point.rentalReal - point.stockReal;
        row.push(gap);
        if (Math.abs(gap) > maxAbs) maxAbs = Math.abs(gap);
      }
      z.push(row);
    });
    var zExtent = maxAbs > 0 ? maxAbs : 1;
    var nice = maxAbs > 0 ? Math.pow(10, Math.floor(Math.log10(maxAbs / 4))) : 1;
    var n = (maxAbs / 4) / nice;
    var zStep = n < 1.5 ? nice : n < 3.5 ? 2 * nice : n < 7.5 ? 5 * nice : 10 * nice;
    if (!(zStep > 0) || zStep > zExtent) zStep = zExtent;
    var series = [];
    var t;
    for (t = 0; t < years.length; t++) {
      var found = [];
      var i;
      for (i = 0; i < prices.length - 1; i++) {
        var z0 = z[i][t];
        var z1 = z[i + 1][t];
        if ((z0 <= 0 && z1 > 0) || (z0 >= 0 && z1 < 0)) {
          var frac = z0 === z1 ? 0 : -z0 / (z1 - z0);
          found.push((prices[i] + frac * (prices[i + 1] - prices[i])) / 1000);
        }
      }
      while (series.length < found.length) series.push({ x: [], y: [] });
      for (i = 0; i < series.length; i++) {
        if (i < found.length) {
          series[i].x.push(years[t]);
          series[i].y.push(found[i]);
        } else {
          series[i].x.push(null);
          series[i].y.push(null);
        }
      }
    }
    var data = [{
      type: 'contour',
      z: z,
      x: years,
      y: prices.map(function (price) { return price / 1000; }),
      zmin: -zExtent,
      zmax: zExtent,
      colorscale: [
        [0, '#7f1d1d'], [0.30, '#991b1b'], [0.42, '#ef4444'], [0.48, '#fecaca'],
        dark ? [0.50, '#1c1916'] : [0.50, '#fffdf8'], [0.52, '#bbf7d0'], [0.58, '#16a34a'], [0.70, '#166534'], [1, '#14532d']
      ],
      contours: { start: -zExtent, end: zExtent, size: zStep, coloring: 'heatmap', showlines: true },
      line: { width: 0.6, color: dark ? 'rgba(244, 239, 232, 0.16)' : 'rgba(31, 26, 23, 0.18)' },
      colorbar: {
        thickness: 8,
        len: 1,
        outlinewidth: 0,
        tickmode: 'array',
        tickvals: [-zExtent, 0, zExtent],
        ticktext: [-zExtent, 0, zExtent].map(compactMoney),
        tickfont: { size: 10, color: dark ? '#b7aba2' : '#6b625b' },
        ticks: ''
      },
      hovertemplate: 'Year %{x:.1f}<br>Price $%{y:.0f}k<br>Rental − stocks %{z:$,.0f}<extra></extra>',
      showscale: true
    }];
    var ink = dark ? '#f3f0e8' : '#1c1b17';
    var yours = dark ? '#9ec0ef' : '#1f4b82';
    var card = dark ? '#1c1916' : '#fffdf8';
    var muted = dark ? '#b7aba2' : '#6b625b';
    var grid = dark ? '#3c342e' : '#e4dcd0';
    series.forEach(function (line, index) {
      data.push({
        type: 'scatter',
        mode: 'lines',
        x: line.x,
        y: line.y,
        line: { color: ink, width: 3 },
        name: 'Even',
        showlegend: index === 0,
        hovertemplate: 'Even at year %{x:.1f}<br>$%{y:.0f}k<extra></extra>'
      });
    });
    if (input.price > 0) {
      data.push({
        type: 'scatter',
        mode: 'lines',
        x: [0, years[years.length - 1]],
        y: [input.price / 1000, input.price / 1000],
        line: { color: yours, width: 2, dash: 'dash' },
        name: 'Yours',
        hovertemplate: 'This rental, $%{y:.0f}k<extra></extra>'
      });
    }
    var yTop = Math.max.apply(null, prices) / 1000;
    var yBottom = Math.min.apply(null, prices) / 1000;
    try {
      Plotly.react(el, data, {
        margin: { t: 28, r: 44, b: 36, l: 48 },
        xaxis: { title: { text: 'Years', font: { size: 11, color: muted }, standoff: 4 }, tickfont: { color: muted }, gridcolor: grid, linecolor: grid, range: [0, years[years.length - 1]], dtick: years[years.length - 1] > 20 ? 5 : 2, zeroline: false, automargin: false },
        yaxis: { title: { text: 'Price ($k)', font: { size: 11, color: muted }, standoff: 2 }, tickfont: { color: muted }, gridcolor: grid, linecolor: grid, range: [yBottom, yTop], automargin: false },
        legend: { orientation: 'h', yanchor: 'bottom', y: 1.02, x: 0, xanchor: 'left', font: { size: 11, color: ink }, bgcolor: 'rgba(0,0,0,0)', itemwidth: 24 },
        hoverlabel: { bgcolor: card, bordercolor: grid, font: { color: ink } },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', size: 12, color: ink }
      }, { responsive: true, displayModeBar: false });
    } catch (err) {
      el.textContent = 'The crossover map could not be drawn.';
    }
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

  function refresh() {
    var input = readInputs();
    var result = RentalModel.project(input);
    var first = result.first;
    if (!first) return;
    $('res-total').textContent = money(first.cashFlow, 0);
    var taxBit = '';
    if (first.incomeTax > 0.5) taxBit = ', after income tax of ' + money(first.incomeTax, 0);
    else if (first.incomeTax < -0.5) taxBit = ', including a tax savings of ' + money(-first.incomeTax, 0);
    $('res-sub').textContent = (first.cashFlow >= 0 ? 'Cash left this month' : 'Cash you add this month') + taxBit + '.';
    renderPie(renderBreakdown(first));
    $('res-loan').textContent = money(result.loan);
    $('res-interest').textContent = money(result.totals.interest);
    $('res-dep').textContent = money(result.totals.firstYearDep);
    if (result.totals.pmiMonths === 0) $('res-pmi').textContent = 'None';
    else if (result.totals.pmiStopMonth) $('res-pmi').textContent = 'Drops off after ' + formatDuration(result.totals.pmiMonths);
    else $('res-pmi').textContent = 'Through the horizon';
    var allowance = result.totals.allowance;
    $('res-note').textContent = allowance > 0
      ? 'Up to ' + money(allowance) + ' of rental losses can offset wages this year.'
      : 'Rental losses do not offset wages at this income. They wait until you sell.';

    var last = result.points[result.points.length - 1];
    var gap = last.rentalReal - last.stockReal;
    var years = Math.round(last.month / 12);
    paintSurplus(
      $('stat-gap'),
      gap === 0 ? 'Even' : (gap > 0 ? 'Rental surplus' : 'Stocks surplus'),
      gap === 0 ? ('At ' + years + (years === 1 ? ' year' : ' years')) : money(Math.abs(gap)),
      gap > 0 ? 'pos' : gap < 0 ? 'neg' : ''
    );
    var cross = result.totals.crossoverMonth;
    var note = '';
    if (cross != null && !result.totals.endsAhead) note = 'The rental leads at ' + formatDuration(cross) + ', then falls behind.';
    $('stat-note').textContent = note;
    $('stat-note').hidden = !note;

    var profile = TaxRules.profile(input.stateCode, input.filingStatus, input.income, input.cityName);
    var filing = input.filingStatus === 'single' ? 'single' : 'joint';
    $('income-hint').textContent = rateText(profile.federalMarginal) + '% federal, ' + filing + '.';

    var place = HomeMarkets.place(marketCode(), $('city').value);
    if (place && place.grossYield > 0 && $('rent-hint')) {
      var expected = RentalModel.marketRent(place.grossYield, place.yieldAnchor, input.price);
      var rentWhere = place.kind === 'city' ? place.city.name : place.state.name;
      $('rent-hint').textContent = Math.abs(input.rentMonth - expected) > 5
        ? 'Using your rent. It still rises with the price.'
        : (place.grossYield * 100).toFixed(1) + '% gross yield in ' + rentWhere + ', on a typical ' + money(place.yieldAnchor) + ' home.';
    }
    var typed = input.homeAppreciation * 100;
    if (!place) $('app-hint').textContent = '';
    else if (Math.abs(typed - place.rate) < 0.005 && place.kind === 'city') {
      $('app-hint').textContent = place.city.name + ', ' + place.rate.toFixed(2) + '% a year since 1991. Statewide was ' + place.state.rate.toFixed(2) + '%.';
    } else if (Math.abs(typed - place.rate) < 0.005) {
      $('app-hint').textContent = place.state.name + ', ' + place.rate.toFixed(2) + '% a year since 1991. Not a forecast.';
    } else {
      var label = place.kind === 'city' ? place.city.name : place.state.name;
      $('app-hint').textContent = formatNumber(typed, 2) + '% instead of the ' + place.rate.toFixed(2) + '% history for ' + label + '.';
    }
    $('tax-hint').textContent = {
      prop13: 'Starts at the purchase price and rises with inflation, capped at 2% a year.',
      market: 'Grows with the home value.',
      inflation: 'Grows with inflation, not the home value.'
    }[input.taxGrowth] || '';
    if (place && place.ins > 0) {
      var where = place.code === 'US' ? 'the U.S.' : (place.insFrom === 'city' ? place.city.name : place.state.name);
      var scope = place.insFrom === 'city' || place.code === 'US' ? '' : ' statewide';
      $('cost-hint').textContent = 'Insurify for ' + where + scope + ', scaled from ' + money(place.ins) + ' on a $300,000 home. No flood.';
    } else $('cost-hint').textContent = '';

    renderYears(result.points);
    renderLines(result.points);
    renderCrossover(input);
  }

  function onEdit(event) {
    var id = event.target.id;
    if (MONEY_IDS.indexOf(id) !== -1 && event.type === 'input') formatMoneyLive(event.target);
    if (id === 'state') {
      fillCities();
      applyAppreciation();
      applyInsurance();
      applyPropertyTax();
      applyRent();
    } else if (id === 'city') {
      applyAppreciation();
      applyInsurance();
      applyRent();
    } else if (id === 'down-pct' || id === 'home-price') {
      syncDownFromPct();
      if (id === 'home-price') {
        applyInsurance();
        applyRent();
      }
    } else if (id === 'down-amt') {
      syncPctFromAmt();
    }
    refresh();
  }

  document.body.addEventListener('input', onEdit);
  document.body.addEventListener('change', onEdit);

  function boot() {
    buildStates();
    fillCities();
    try { applyAppreciation(); } catch (err) { console.error(err); }
    try { applyInsurance(); } catch (err) { console.error(err); }
    try { applyRent(); } catch (err) { console.error(err); }
    try { applyPropertyTax(); } catch (err) { console.error(err); }
    try { syncDownFromPct(); } catch (err) { console.error(err); }
    refresh();
  }

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (lineChart) { lineChart.destroy(); lineChart = null; }
      if (pieChart) { pieChart.destroy(); pieChart = null; }
      refresh();
    });
  }

  boot();
})();
