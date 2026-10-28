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
  var MONEY_IDS = ['income', 'hoa', 'insurance', 'down-amt'];
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
    setRange('rent', RentalModel.marketRent(place.grossYield, place.yieldAnchor, price));
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
    if (!body) return;
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
            tension: 0
          },
          {
            label: 'Stocks',
            data: points.map(function (p) { return { x: p.month / 12, y: p.stockReal }; }),
            borderColor: STOCK,
            backgroundColor: STOCK,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0
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
              callback: function (v) { return compactMoney(v); }
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
      var whole = Math.abs(millions - Math.round(millions)) < 0.05 || millions >= 10;
      return sign + '$' + (whole ? String(Math.round(millions)) : millions.toFixed(1)) + 'M';
    }
    if (abs >= 1000) return sign + '$' + Math.round(abs / 1000) + 'k';
    return sign + '$' + Math.round(abs);
  }

  var lockedScale = { price: null, zExtent: null };

  function renderCrossover(input, fast) {
    var el = $('crossoverChart');
    if (!el || typeof Plotly === 'undefined') return;
    var dark = isDark();
    var horizon = Math.round(input.horizonYears * 12);
    var center = input.price || 500000;
    var half = 600000;
    var low = Math.max(0, center - half);
    var high = center + half;
    var step = 50000;
    var prices = [Math.round(low)];
    var p;
    var start = Math.ceil((low + 1) / step) * step;
    var end = Math.floor((high - 1) / step) * step;
    for (p = start; p <= end + 1; p += step) prices.push(Math.round(p));
    if (Math.round(high) - prices[prices.length - 1] > 1) prices.push(Math.round(high));
    if (prices.length < 2) prices = [step, step * 2];
    var stride = 6;
    var years = [];
    var month;
    for (month = 0; month <= horizon; month += stride) years.push(month / 12);
    var z = [];
    var maxAbs = 0;
    var results = prices.map(function (price) { return RentalModel.project(RentalModel.atPrice(input, Math.max(price, 1000))); });
    results.forEach(function (result) {
      var row = [];
      var t;
      for (t = 0; t < years.length; t++) {
        var point = result.points[Math.min(Math.round(years[t] * 12), result.points.length - 1)];
        var gap = point.rentalReal - point.stockReal;
        row.push(gap);
        if (Math.abs(gap) > maxAbs) maxAbs = Math.abs(gap);
      }
      z.push(row);
    });
    var nice = maxAbs > 0 ? Math.pow(10, Math.floor(Math.log10(maxAbs / 4))) : 1;
    var n = (maxAbs / 4) / nice;
    var zStep = n < 1.5 ? nice : n < 3.5 ? 2 * nice : n < 7.5 ? 5 * nice : 10 * nice;
    var freshExtent = Math.max(1, Math.ceil(maxAbs / zStep)) * zStep;
    if (!(lockedScale.zExtent > 0) || freshExtent > lockedScale.zExtent * 1.35 || freshExtent < lockedScale.zExtent * 0.5) {
      lockedScale.zExtent = freshExtent;
      lockedScale.step = zStep;
    }
    var zExtent = lockedScale.zExtent;
    zStep = lockedScale.step || zStep;
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
        thicknessmode: 'pixels',
        len: 1,
        outlinewidth: 0,
        x: 1.02,
        xanchor: 'left',
        xref: 'paper',
        xpad: 4,
        tickmode: 'array',
        tickvals: [-zExtent, 0, zExtent],
        ticktext: [-zExtent, 0, zExtent].map(compactMoney),
        tickfont: { size: 10, color: dark ? '#b7aba2' : '#6b625b' },
        ticks: ''
      },
      hovertext: z.map(function (row) {
        return row.map(function (gap) { return 'Rental − stocks ' + compactMoney(gap); });
      }),
      hovertemplate: 'Year %{x:.1f}<br>Price $%{y:.0f}k<br>%{hovertext}<extra></extra>',
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
    var yTop = high / 1000;
    var yBottom = low / 1000;
    var tag = null;
    var typical = (function () {
      if (typeof HomeMarkets === 'undefined') return 0;
      var code = input.stateCode || 'CA';
      var id = '';
      var list = HomeMarkets.cities(code) || [];
      var i;
      if (input.cityName) {
        for (i = 0; i < list.length; i++) {
          if (list[i].name === input.cityName) { id = list[i].id; break; }
        }
      }
      var place = HomeMarkets.place(code, id);
      return place && place.yieldAnchor > 0 ? place.yieldAnchor : 0;
    })();
    if (typical > 0) {
      data.push({
        type: 'scatter',
        mode: 'lines',
        x: [0, years[years.length - 1]],
        y: [typical / 1000, typical / 1000],
        line: { color: dark ? '#e6c98a' : '#8a6a32', width: 2, dash: 'dot' },
        name: 'Median',
        hovertemplate: 'Median home this year<br>$%{y:.0f}k<extra></extra>'
      });
    }
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
      var mine = RentalModel.project(input);
      var lastPoint = mine.points[mine.points.length - 1];
      var gap = lastPoint.rentalReal - lastPoint.stockReal;
      var tone = gap > 0 ? (dark ? '#8dcea8' : '#1f6b45') : gap < 0 ? (dark ? '#e2a888' : '#a65b2b') : ink;
      var who = gap > 0 ? 'House ahead ' : gap < 0 ? 'Stocks ahead ' : '';
      var ySpan = (high - low) / 1000;
      var yNorm = ySpan > 0 ? (input.price - low) / (high - low) : 0.5;
      var above = yNorm < 0.78;
      tag = {
        x: years[years.length - 1],
        y: input.price / 1000,
        xref: 'x',
        yref: 'y',
        text: compactMoney(input.price) + ' · ' + (gap === 0 ? 'Even' : who + compactMoney(Math.abs(gap))),
        showarrow: false,
        xanchor: 'right',
        yanchor: above ? 'bottom' : 'top',
        xshift: -6,
        yshift: above ? 8 : -8,
        font: { size: 11, color: tone },
        bgcolor: card,
        borderpad: 3
      };
      data.push({
        type: 'scatter',
        mode: 'markers',
        x: [years[years.length - 1]],
        y: [input.price / 1000],
        marker: { size: 8, color: tone, line: { color: card, width: 2 } },
        cliponaxis: false,
        name: 'At the end',
        showlegend: false,
        hovertemplate: 'Year %{x:.0f}<br>' + (gap >= 0 ? 'Rental' : 'Stocks') + ' ahead<extra></extra>'
      });
    }
    try {
      Plotly.react(el, data, {
        width: el.clientWidth || undefined,
        height: el.clientHeight || undefined,
        uirevision: 'crossover',
        margin: { t: 36, r: 78, b: 42, l: 54, autoexpand: false },
        xaxis: { domain: [0, 1], title: { text: 'Years after purchase', font: { size: 11, color: muted }, standoff: 4 }, tickfont: { color: muted }, gridcolor: grid, linecolor: grid, range: [0, years[years.length - 1]], dtick: years[years.length - 1] > 20 ? 5 : 2, zeroline: false, automargin: false },
        yaxis: { title: { text: 'Home price ($k)', font: { size: 11, color: muted }, standoff: 2 }, tickfont: { color: muted }, gridcolor: grid, linecolor: grid, range: [yBottom, yTop], automargin: false },
        legend: { orientation: 'h', yanchor: 'bottom', y: 1.02, x: 0, xanchor: 'left', font: { size: 11, color: ink }, bgcolor: 'rgba(0,0,0,0)' },
        hoverlabel: { bgcolor: card, bordercolor: grid, font: { color: ink } },
        annotations: tag ? [tag] : [],
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

  function refresh(fast) {
    if (window.RedfinLink) RedfinLink.paint();
    var input = readInputs();
    if (fast) {
      scheduleCrossover(input);
      return;
    }
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
    var gapEl = $('stat-gap');
    if (gapEl) paintSurplus(
      gapEl,
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
      var rentWhere = place.kind === 'city' ? place.city.name : place.state.name;
      $('rent-hint').textContent = (place.grossYield * 100).toFixed(1) + '% gross yield in ' + rentWhere + ', on a median ' + money(place.yieldAnchor) + ' home.';
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

    if (fast) {
      scheduleCrossover(input);
      return;
    }

    renderYears(result.points);
    renderLines(result.points);
    crossJob = null;
    renderCrossover(input);
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
        try { renderCrossover(job, true); } catch (err) {}
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
    if (!out) return;
    if (el.id === 'home-price') out.textContent = knobPrice(val);
    else if (el.id === 'rent') out.textContent = money(val, 0);
    else if (el.id === 'loan-rate') {
      var rate = Math.round(val * 100) / 100;
      out.textContent = (Math.round(val * 10) / 10).toFixed(1) + '%';
    } else if (el.id === 'down-pct') out.textContent = Math.round(val) + '%';
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
    } else if (id === 'rent') {
      applyRent();
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

  function bindKnobs() {
    document.querySelectorAll('.vrange').forEach(function (box) {
      var el = box.querySelector('input[type="range"]');
      if (!el || el.id === 'rent') return;
      function valueFromX(clientX) {
        var rect = box.getBoundingClientRect();
        var pad = 14;
        var span = Math.max(1, rect.width - pad * 2);
        var t = (clientX - rect.left - pad) / span;
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
        var v = valueFromX(event.clientX);
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
    try { applyPropertyTax(); } catch (err) { console.error(err); }
    try { syncDownFromPct(); } catch (err) { console.error(err); }
    try { applyRent(); } catch (err) { console.error(err); }
    paintSliders();
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
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (lineChart) { lineChart.destroy(); lineChart = null; }
      if (pieChart) { pieChart.destroy(); pieChart = null; }
      refresh();
    });
  }

  function tooltipOpen(chart) {
    return !!(chart && chart.tooltip && chart.tooltip.getActiveElements && chart.tooltip.getActiveElements().length);
  }

  document.addEventListener('pointerdown', function (event) {
    var target = event.target;
    if (window.Plotly && Plotly.Fx && Plotly.Fx.unhover) {
      var plots = document.querySelectorAll('.js-plotly-plot');
      var i;
      for (i = 0; i < plots.length; i++) {
        if (plots[i].contains(target)) continue;
        try { Plotly.Fx.unhover(plots[i]); } catch (err) {}
        var layer = plots[i].querySelector('.hoverlayer');
        if (layer) layer.replaceChildren();
      }
    }
    [pieChart, lineChart].forEach(function (chart) {
      if (!tooltipOpen(chart) || !chart.canvas || chart.canvas.contains(target)) return;
      chart.setActiveElements([]);
      chart.tooltip.setActiveElements([], { x: 0, y: 0 });
      chart.update('none');
    });
  }, true);

  boot();
})();
