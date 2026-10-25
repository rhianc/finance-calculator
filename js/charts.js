(function (root) {
  'use strict';

  var pieChart = null;
  var lineChart = null;
  var scaleChart = null;
  var HOUSE = '#2f6d52';
  var RENT = '#b56a3c';
  var chartDark = null;

  function isDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function chartTheme() {
    var dark = isDark();
    if (typeof Chart !== 'undefined') {
      Chart.defaults.color = dark ? '#b7aba2' : '#6b625b';
      Chart.defaults.borderColor = dark ? '#3c342e' : '#e4dcd0';
    }
    if (chartDark !== null && chartDark !== dark) {
      if (lineChart) { lineChart.destroy(); lineChart = null; }
      if (pieChart) { pieChart.destroy(); pieChart = null; }
    }
    chartDark = dark;
    return dark;
  }

  function destroy(chart) {
    if (chart) chart.destroy();
  }

  function renderPie(canvas, slices) {
    chartTheme();
    if (!canvas || typeof Chart === 'undefined' || !slices.length) {
      destroy(pieChart);
      pieChart = null;
      return;
    }
    var labels = slices.map(function (slice) { return slice.label; });
    var values = slices.map(function (slice) { return slice.value; });
    var colors = slices.map(function (slice) { return slice.color; });
    var border = chartDark ? '#1c1916' : '#fffdf8';
    if (pieChart) {
      pieChart.data.labels = labels;
      pieChart.data.datasets[0].data = values;
      pieChart.data.datasets[0].backgroundColor = colors;
      pieChart.data.datasets[0].borderColor = border;
      pieChart.update('none');
      return;
    }
    pieChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: border
        }]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.label + ': $' + Math.round(ctx.parsed).toLocaleString('en-US');
              }
            }
          }
        }
      }
    });
  }

  // Hold the wealth axis until the lines no longer fit, so a small edit
  // does not restack the ticks and shove the plot sideways.
  var lineScale = { min: 0, max: 1, step: 1, unit: 'd', ready: false };

  function fitLineScale(points) {
    var min = Infinity;
    var max = -Infinity;
    var i;
    for (i = 0; i < points.length; i++) {
      var house = points[i].houseReal;
      var rent = points[i].rentReal;
      if (house < min) min = house;
      if (rent < min) min = rent;
      if (house > max) max = house;
      if (rent > max) max = rent;
    }
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    var span = Math.max(max - min, 1);
    var lo = min >= 0 ? Math.max(0, min - span * 0.06) : min - span * 0.06;
    var hi = max + span * 0.08;
    var step = niceStep(Math.max(hi - lo, 1));
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    if (hi <= lo) hi = lo + step;
    var unit = Math.max(Math.abs(lo), Math.abs(hi)) >= 1000000 ? 'm' : (Math.max(Math.abs(lo), Math.abs(hi)) >= 1000 ? 'k' : 'd');
    if (lineScale.ready && min >= lineScale.min && max <= lineScale.max && span > (lineScale.max - lineScale.min) * 0.62 && unit === lineScale.unit) {
      return lineScale;
    }
    lineScale = { min: lo, max: hi, step: step, unit: unit, ready: true };
    return lineScale;
  }

  function formatAxisTick(value) {
    var sign = value < 0 ? '−' : '';
    var abs = Math.abs(value);
    if (abs < lineScale.step * 0.01) return '$0';
    if (lineScale.unit === 'm') {
      var millions = abs / 1000000;
      var digits = lineScale.step < 1000000 ? 1 : 0;
      return sign + '$' + millions.toFixed(digits) + 'M';
    }
    if (lineScale.unit === 'k') return sign + '$' + Math.round(abs / 1000) + 'k';
    return sign + '$' + Math.round(abs).toLocaleString('en-US');
  }

  function renderLines(canvas, points) {
    if (!canvas || typeof Chart === 'undefined') return;
    chartTheme();
    var house = points.map(function (point) { return { x: point.month / 12, y: point.houseReal }; });
    var rent = points.map(function (point) { return { x: point.month / 12, y: point.rentReal }; });
    var last = points.length ? points[points.length - 1].month / 12 : 0;
    var scale = fitLineScale(points);
    if (lineChart) {
      lineChart.data.datasets[0].data = house;
      lineChart.data.datasets[1].data = rent;
      lineChart.options.scales.x.max = last;
      lineChart.options.scales.y.min = scale.min;
      lineChart.options.scales.y.max = scale.max;
      lineChart.options.scales.y.ticks.stepSize = scale.step;
      lineChart.update('none');
      return;
    }
    lineChart = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Buy, if sold',
            data: house,
            borderColor: HOUSE,
            backgroundColor: 'rgba(31, 75, 130, 0.08)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
            fill: false
          },
          {
            label: 'Rent and invest',
            data: rent,
            borderColor: RENT,
            backgroundColor: 'rgba(166, 91, 43, 0.08)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
            fill: false
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, boxHeight: 12, font: { family: 'system-ui, sans-serif', size: 12 } }
          },
          tooltip: {
            callbacks: {
              title: function (items) {
                var years = items[0].parsed.x;
                return years.toFixed(1).replace(/\.0$/, '') + (years === 1 ? ' year' : ' years');
              },
              label: function (ctx) {
                var value = ctx.parsed.y;
                var sign = value < 0 ? '−' : '';
                return ctx.dataset.label + ': ' + sign + '$' + Math.abs(Math.round(value)).toLocaleString('en-US');
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            min: 0,
            max: last,
            title: { display: true, text: 'Years', font: { family: 'system-ui, sans-serif', size: 12 } },
            ticks: { maxTicksLimit: 8, font: { family: 'system-ui, sans-serif', size: 11 } },
            grid: { color: chartDark ? 'rgba(243, 240, 232, 0.08)' : 'rgba(28, 27, 23, 0.06)' }
          },
          y: {
            min: scale.min,
            max: scale.max,
            title: { display: true, text: "Today's dollars", font: { family: 'system-ui, sans-serif', size: 12 } },
            ticks: {
              stepSize: scale.step,
              maxTicksLimit: 7,
              font: { family: 'system-ui, sans-serif', size: 11 },
              callback: function (value) { return formatAxisTick(value); }
            },
            grid: { color: chartDark ? 'rgba(243, 240, 232, 0.08)' : 'rgba(28, 27, 23, 0.06)' }
          }
        }
      }
    });
  }

  function renderScale(canvas) {
    if (!canvas || typeof Chart === 'undefined' || scaleChart || !root.FinanceModel) return;
    var rates = [];
    var i;
    for (i = 0; i <= 24; i++) rates.push(i * 0.5);
    var terms = [15, 20, 30];
    var colors = [HOUSE, '#3f6f54', RENT];
    scaleChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: rates.map(function (rate) { return rate.toFixed(1); }),
        datasets: terms.map(function (years, index) {
          return {
            label: years + ' years',
            data: rates.map(function (rate) {
              return root.FinanceModel.mortgagePayment(1000, rate / 100, years);
            }),
            borderColor: colors[index],
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.12
          };
        })
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: {
            callbacks: {
              title: function (items) { return items[0].label + '%'; },
              label: function (ctx) {
                return ctx.dataset.label + ': $' + ctx.parsed.y.toFixed(2) + ' per $1,000';
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Annual rate' },
            ticks: {
              autoSkip: false,
              maxRotation: 0,
              callback: function (value) {
                var rate = value * 0.5;
                return Math.abs(rate % 1) < 0.001 ? rate.toFixed(0) + '%' : '';
              }
            }
          },
          y: {
            title: { display: true, text: 'Monthly payment per $1,000' },
            beginAtZero: true
          }
        }
      }
    });
  }

  function resizeScale() {
    if (scaleChart) scaleChart.resize();
  }

  // The price axis follows the price you entered, not the tie. Rent, rate,
  // and the down payment move the colors inside a scale that stays put.
  var PRICE_HALF = 600000;
  var PRICE_PAD = 50000;
  var lockedScale = { zExtent: null, step: null };

  function gapAtMonth(spec, price, month) {
    var result = root.FinanceModel.project(root.FinanceModel.atPrice(spec, price));
    var point = result.points[Math.min(month, result.points.length - 1)];
    return point.houseReal - point.rentReal;
  }

  function breakevenAt(spec, month) {
    var samples = [];
    var price;
    for (price = 50000; price <= 4000000; price += 200000) {
      samples.push({ price: price, gap: gapAtMonth(spec, price, month) });
    }
    var target = spec.price > 0 ? spec.price : 1000000;
    var best = null;
    var i;
    for (i = 0; i < samples.length - 1; i++) {
      var g0 = samples[i].gap;
      var g1 = samples[i + 1].gap;
      if (!((g0 <= 0 && g1 > 0) || (g0 >= 0 && g1 < 0))) continue;
      var lo = samples[i].price;
      var hi = samples[i + 1].price;
      var glo = g0;
      var k;
      for (k = 0; k < 18; k++) {
        var mid = (lo + hi) / 2;
        var gap = gapAtMonth(spec, mid, month);
        if (gap === 0) return mid;
        if ((gap > 0) === (glo > 0)) {
          lo = mid;
          glo = gap;
        } else {
          hi = mid;
        }
      }
      var root = (lo + hi) / 2;
      if (best == null || Math.abs(root - target) < Math.abs(best - target)) best = root;
    }
    return best;
  }

  // A fixed $1.2M window pinned to the price. It slides with the price
  // once that price clears $600k, and it does not snap to a $50k grid.
  function priceWindow(center, price) {
    var anchor = price > 0 ? price : (center > 0 ? center : 800000);
    var low = anchor - PRICE_HALF;
    var high = anchor + PRICE_HALF;
    if (low < 0) {
      low = 0;
      high = PRICE_HALF * 2;
    }
    return { low: low, high: high, center: anchor };
  }

  function coverAxis(prices, low, high) {
    var rows = prices.slice();
    if (!rows.length || rows[0] > low + 1) rows.unshift(low);
    if (!rows.length || rows[rows.length - 1] < high - 1) rows.push(high);
    var step = rows.length > 1 ? rows[1] - rows[0] : PRICE_PAD;
    rows.unshift(rows[0] - step);
    rows.push(rows[rows.length - 1] + step);
    return rows;
  }

  function priceGrid(low, high) {
    var step = PRICE_PAD;
    var prices = [Math.round(low)];
    var start = Math.ceil((low + 1) / step) * step;
    var end = Math.floor((high - 1) / step) * step;
    var p;
    for (p = start; p <= end + 1; p += step) prices.push(Math.round(p));
    if (Math.round(high) - prices[prices.length - 1] > 1) prices.push(Math.round(high));
    return prices;
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

  function niceStep(maxAbs) {
    if (!(maxAbs > 0)) return 1;
    var target = maxAbs / 4;
    var pow = Math.pow(10, Math.floor(Math.log10(target)));
    var n = target / pow;
    if (n < 1.5) return pow;
    if (n < 3.5) return 2 * pow;
    if (n < 7.5) return 5 * pow;
    return 10 * pow;
  }

  function typicalPrice(spec) {
    var markets = root.HomeMarkets;
    if (!markets || !spec) return 0;
    var code = spec.stateCode || 'CA';
    var id = '';
    var list = markets.cities(code) || [];
    var i;
    if (spec.cityName) {
      for (i = 0; i < list.length; i++) {
        if (list[i].name === spec.cityName) { id = list[i].id; break; }
      }
    }
    var place = markets.place(code, id);
    return place && place.yieldAnchor > 0 ? place.yieldAnchor : 0;
  }

  function renderCrossover(input, fast) {
    var el = document.getElementById('crossoverChart');
    if (!el || !root.FinanceModel) return;
    if (typeof Plotly === 'undefined') {
      el.textContent = 'The crossover map needs a network connection to draw.';
      return;
    }
    var dark = isDark();
    var spec = root.FinanceModel.normalize(input);
    var horizon = Math.round(spec.horizonYears * 12);
    var yWindow = priceWindow(spec.price > 0 ? spec.price : 800000, spec.price);
    // Same grid while dragging and after release, so the tie line does not jump.
    var prices = priceGrid(yWindow.low, yWindow.high);
    var stride = 6;
    var years = [];
    var month;
    for (month = 0; month <= horizon; month += stride) years.push(month / 12);

    var z = [];
    var maxAbs = 0;
    var i;
    var t;
    for (i = 0; i < prices.length; i++) {
      var result = root.FinanceModel.project(root.FinanceModel.atPrice(spec, Math.max(prices[i], 1000)));
      var row = [];
      for (t = 0; t < years.length; t++) {
        var point = result.points[Math.min(Math.round(years[t] * 12), result.points.length - 1)];
        var gap = point.houseReal - point.rentReal;
        row.push(gap);
        if (Math.abs(gap) > maxAbs) maxAbs = Math.abs(gap);
      }
      z.push(row);
    }

    var step = niceStep(maxAbs);
    var levels = Math.max(1, Math.ceil(maxAbs / step));
    var freshExtent = levels * step;
    if (!(lockedScale.zExtent > 0) || freshExtent > lockedScale.zExtent * 1.35 || freshExtent < lockedScale.zExtent * 0.5) {
      lockedScale.zExtent = freshExtent;
      lockedScale.step = step;
    }
    var zExtent = lockedScale.zExtent;
    step = lockedScale.step;
    var pricesK = prices.map(function (price) { return price / 1000; });

    var series = [];
    for (t = 0; t < years.length; t++) {
      var found = [];
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
      y: pricesK,
      zmin: -zExtent,
      zmax: zExtent,
      // Steep near zero so a gap of a couple million still reads as green or red
      // when an expensive home stretches the scale to the tens of millions.
      colorscale: [
        [0, '#7f1d1d'],
        [0.30, '#991b1b'],
        [0.42, '#ef4444'],
        [0.48, '#fecaca'],
        [0.50, dark ? '#1c1916' : '#fffdf8'],
        [0.52, '#bbf7d0'],
        [0.58, '#16a34a'],
        [0.70, '#166534'],
        [1, '#14532d']
      ],
      contours: {
        start: -zExtent,
        end: zExtent,
        size: step,
        coloring: 'heatmap',
        showlines: true
      },
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
        return row.map(function (gap) { return 'Buy − rent ' + compactMoney(gap); });
      }),
      hovertemplate: 'Year %{x:.1f}<br>Price $%{y:.0f}k<br>%{hovertext}<extra></extra>',
      showscale: true
    }];

    var ink = dark ? '#f3f0e8' : '#1c1b17';
    var yours = dark ? '#9ec0ef' : '#1f4b82';
    var card = dark ? '#1c1916' : '#fffdf8';
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

    var yTop = yWindow.high / 1000;
    var yBottom = yWindow.low / 1000;
    var tag = null;
    var typical = typicalPrice(spec);
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
    if (spec.price > 0) {
      data.push({
        type: 'scatter',
        mode: 'lines',
        x: [0, years[years.length - 1]],
        y: [spec.price / 1000, spec.price / 1000],
        line: { color: yours, width: 2, dash: 'dash' },
        name: 'Yours',
        hovertemplate: 'This home, $%{y:.0f}k<extra></extra>'
      });
      var mine = root.FinanceModel.project(spec);
      var last = mine.points[mine.points.length - 1];
      var gap = last.houseReal - last.rentReal;
      var tone = gap > 0 ? (dark ? '#8dcea8' : '#1f6b45') : gap < 0 ? (dark ? '#e2a888' : '#a65b2b') : ink;
      var who = gap > 0 ? 'Buy ahead ' : gap < 0 ? 'Rent ahead ' : '';
      var ySpan = yTop - yBottom;
      var yNorm = ySpan > 0 ? (spec.price / 1000 - yBottom) / ySpan : 0.5;
      var above = yNorm < 0.78;
      var narrow = (el.clientWidth || 800) < 560;
      var outcome = gap === 0 ? 'Even' : who + compactMoney(Math.abs(gap));
      tag = {
        x: years[years.length - 1],
        y: spec.price / 1000,
        xref: 'x',
        yref: 'y',
        text: narrow ? outcome : compactMoney(spec.price) + ' · ' + outcome,
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
        y: [spec.price / 1000],
        marker: { size: 8, color: tone, line: { color: card, width: 2 } },
        cliponaxis: true,
        name: 'At the end',
        showlegend: false,
        hovertemplate: 'Year %{x:.0f}<br>' + (gap >= 0 ? 'Buying' : 'Renting') + ' ahead<extra></extra>'
      });
      if (mine.totals.crossoverMonth != null) {
        data.push({
          type: 'scatter',
          mode: 'markers',
          x: [mine.totals.crossoverMonth / 12],
          y: [spec.price / 1000],
          marker: { size: 11, color: ink, line: { color: card, width: 2 } },
          name: 'Tie',
          showlegend: false,
          hovertemplate: 'This home ties at year %{x:.1f}<extra></extra>'
        });
      }
    }

    var muted = dark ? '#b7aba2' : '#6b625b';
    var grid = dark ? '#3c342e' : '#e4dcd0';
    var layout = {
      width: el.clientWidth || undefined,
      height: el.clientHeight || undefined,
      uirevision: 'crossover',
      margin: { t: 36, r: 78, b: 42, l: 54, autoexpand: false },
      xaxis: {
        domain: [0, 1],
        title: { text: 'Years after purchase', font: { size: 11, color: muted }, standoff: 4 },
        tickfont: { color: muted },
        gridcolor: grid,
        linecolor: grid,
        range: [0, years[years.length - 1]],
        dtick: years[years.length - 1] > 20 ? 5 : 2,
        zeroline: false,
        automargin: false
      },
      yaxis: {
        title: { text: 'Home price ($k)', font: { size: 11, color: muted }, standoff: 2 },
        tickfont: { color: muted },
        gridcolor: grid,
        linecolor: grid,
        range: [yBottom, yTop],
        automargin: false
      },
      legend: {
        orientation: 'h',
        yanchor: 'bottom',
        y: 1.02,
        x: 0,
        xanchor: 'left',
        font: { size: 11, color: ink },
        bgcolor: 'rgba(0,0,0,0)'
      },
      hoverlabel: { bgcolor: card, bordercolor: grid, font: { color: ink } },
      annotations: tag ? [tag] : [],
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', size: 12, color: ink }
    };

    try {
      Plotly.react(el, data, layout, { responsive: true, displayModeBar: false });
    } catch (err) {
      el.textContent = 'The crossover map could not be drawn.';
    }
  }

  function tooltipOpen(chart) {
    return !!(chart && chart.tooltip && chart.tooltip.getActiveElements && chart.tooltip.getActiveElements().length);
  }

  function hideTooltip(chart) {
    if (!tooltipOpen(chart)) return;
    chart.setActiveElements([]);
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.update('none');
  }

  // A finger tap never sends the "pointer left the plot" event that a mouse
  // does, so the point card stays up and covers the map. Clear it on any tap
  // that is not on that plot.
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
    [pieChart, lineChart, scaleChart].forEach(function (chart) {
      if (!chart || !chart.canvas || chart.canvas.contains(target)) return;
      hideTooltip(chart);
    });
  }, true);

  root.FinanceCharts = {
    renderPie: renderPie,
    renderLines: renderLines,
    renderScale: renderScale,
    resizeScale: resizeScale,
    renderCrossover: renderCrossover
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
