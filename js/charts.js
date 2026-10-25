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
    destroy(pieChart);
    pieChart = null;
    if (!canvas || typeof Chart === 'undefined' || !slices.length) return;
    pieChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: slices.map(function (slice) { return slice.label; }),
        datasets: [{
          data: slices.map(function (slice) { return slice.value; }),
          backgroundColor: slices.map(function (slice) { return slice.color; }),
          borderWidth: 2,
          borderColor: chartDark ? '#1c1916' : '#fffdf8'
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

  function renderLines(canvas, points) {
    if (!canvas || typeof Chart === 'undefined') return;
    chartTheme();
    var house = points.map(function (point) { return { x: point.month / 12, y: point.houseReal }; });
    var rent = points.map(function (point) { return { x: point.month / 12, y: point.rentReal }; });
    var last = points.length ? points[points.length - 1].month / 12 : 0;
    if (lineChart) {
      lineChart.data.datasets[0].data = house;
      lineChart.data.datasets[1].data = rent;
      lineChart.options.scales.x.max = last;
      lineChart.update();
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
            tension: 0.15,
            fill: false
          },
          {
            label: 'Rent and invest',
            data: rent,
            borderColor: RENT,
            backgroundColor: 'rgba(166, 91, 43, 0.08)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.15,
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
            title: { display: true, text: "Today's dollars", font: { family: 'system-ui, sans-serif', size: 12 } },
            ticks: {
              maxTicksLimit: 7,
              font: { family: 'system-ui, sans-serif', size: 11 },
              callback: function (value) {
                var sign = value < 0 ? '−' : '';
                var abs = Math.abs(value);
                if (abs >= 1000000) return sign + '$' + (abs / 1000000).toFixed(abs >= 10000000 ? 0 : 1) + 'M';
                if (abs >= 1000) return sign + '$' + Math.round(abs / 1000) + 'k';
                return sign + '$' + Math.round(abs);
              }
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
  var lockedScale = { price: null, zExtent: null };

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

  function priceWindow(center, price) {
    if (!(center > 0)) center = price > 0 ? price : PRICE_HALF;
    var half = PRICE_HALF;
    if (price > 0) half = Math.max(half, Math.abs(price - center) + PRICE_PAD);
    var low = center - half;
    var high = center + half;
    if (low > 0) {
      half = Math.ceil(half / PRICE_PAD) * PRICE_PAD;
      low = center - half;
      high = center + half;
    }
    if (low < 0) {
      low = 0;
      high = Math.ceil(high / PRICE_PAD) * PRICE_PAD;
    }
    if (price > 0 && high < price + PRICE_PAD) {
      high = Math.ceil((price + PRICE_PAD) / PRICE_PAD) * PRICE_PAD;
    }
    if (high <= low) high = low + PRICE_HALF * 2;
    return { low: low, high: high, center: center };
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

  function priceGrid(low, high, minStep) {
    var start = Math.max(PRICE_PAD, low);
    start = Math.ceil(start / PRICE_PAD) * PRICE_PAD;
    var end = Math.floor(high / PRICE_PAD) * PRICE_PAD;
    if (end <= start) end = start + PRICE_PAD;
    var step = (end - start) / PRICE_PAD > 48 ? 100000 : PRICE_PAD;
    if (minStep && step < minStep) step = minStep;
    var prices = [];
    var p;
    for (p = start; p <= end + step * 0.01; p += step) prices.push(Math.round(p));
    return prices;
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
    var prices = priceGrid(yWindow.low, yWindow.high, fast ? 200000 : 0);
    if (fast) prices = coverAxis(prices, yWindow.low, yWindow.high);
    var stride = fast ? 12 : 1;
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
    var priceKey = Math.round((spec.price || 0) / 5000) * 5000;
    if (lockedScale.price !== priceKey || !(lockedScale.zExtent > 0)) {
      lockedScale.price = priceKey;
      lockedScale.zExtent = freshExtent;
    }
    var zExtent = lockedScale.zExtent;
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
        len: 1,
        outlinewidth: 0,
        tickmode: 'array',
        tickvals: [-zExtent, 0, zExtent],
        ticktext: [-zExtent, 0, zExtent].map(compactMoney),
        tickfont: { size: 10, color: dark ? '#b7aba2' : '#6b625b' },
        ticks: ''
      },
      hovertemplate: 'Year %{x:.1f}<br>Price $%{y:.0f}k<br>Buy − rent %{z:$,.0f}<extra></extra>',
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
        name: 'Avg',
        hovertemplate: 'Typical home this year<br>$%{y:.0f}k<extra></extra>'
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
      var who = gap > 0 ? 'Buy ' : gap < 0 ? 'Rent ' : '';
      tag = {
        x: years[years.length - 1],
        y: spec.price / 1000,
        xref: 'x',
        yref: 'y',
        text: compactMoney(spec.price) + ' · ' + (gap === 0 ? 'Even' : who + compactMoney(Math.abs(gap))),
        showarrow: false,
        xanchor: 'right',
        yanchor: 'bottom',
        xshift: -4,
        yshift: 2,
        font: { size: 11, color: tone },
        bgcolor: 'rgba(0,0,0,0)'
      };
      data.push({
        type: 'scatter',
        mode: 'markers',
        x: [years[years.length - 1]],
        y: [spec.price / 1000],
        marker: { size: 8, color: tone, line: { color: card, width: 2 } },
        cliponaxis: false,
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
      margin: { t: 28, r: 44, b: 36, l: 48 },
      xaxis: {
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
        bgcolor: 'rgba(0,0,0,0)',
        itemwidth: 24
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

  root.FinanceCharts = {
    renderPie: renderPie,
    renderLines: renderLines,
    renderScale: renderScale,
    resizeScale: resizeScale,
    renderCrossover: renderCrossover
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
