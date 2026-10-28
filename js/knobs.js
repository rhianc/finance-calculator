// Editable numbers above the dials.
(function (root) {
  'use strict';

  function parse(kind, text) {
    var raw = String(text == null ? '' : text).trim().replace(/[$,%\s]/g, '');
    if (!raw) return null;
    var mult = 1;
    if (/m$/i.test(raw)) {
      mult = 1000000;
      raw = raw.slice(0, -1);
    } else if (/k$/i.test(raw)) {
      mult = 1000;
      raw = raw.slice(0, -1);
    }
    var n = parseFloat(raw);
    if (!isFinite(n)) return null;
    n *= mult;
    var suffixed = /[km]$/i.test(String(text).trim().replace(/[$,%\s]/g, ''));
    if (kind === 'k' && !suffixed && Math.abs(n) < 10000) n *= 1000;
    return n;
  }

  function editString(kind, value) {
    if (kind === 'k') {
      var thousands = Math.round(value / 100) / 10;
      return String(thousands).replace(/\.0$/, '');
    }
    if (kind === 'usd') return String(Math.round(value));
    var rounded = Math.round(value * 100) / 100;
    return String(rounded);
  }

  function bind(opts) {
    root.document.querySelectorAll('.knob-num').forEach(function (el) {
      if (el.readOnly) return;
      el.addEventListener('input', function (event) { event.stopPropagation(); });
      el.addEventListener('change', function (event) { event.stopPropagation(); });
      el.addEventListener('focus', function () {
        var slider = root.document.getElementById(el.getAttribute('data-for'));
        if (!slider) return;
        el.value = editString(el.getAttribute('data-kind'), parseFloat(slider.value));
        setTimeout(function () {
          if (document.activeElement === el) el.select();
        }, 0);
      });
      el.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') el.blur();
      });
      el.addEventListener('blur', function () {
        var id = el.getAttribute('data-for');
        var n = parse(el.getAttribute('data-kind'), el.value);
        if (n != null && opts.commit) opts.commit(id, n);
        else if (opts.paint) opts.paint(id);
      });
    });
    // A tap on a dial is not a focus change, so commit the open number first.
    root.document.addEventListener('pointerdown', function (event) {
      var active = root.document.activeElement;
      if (!active || !active.classList || !active.classList.contains('knob-num')) return;
      if (event.target === active) return;
      active.blur();
    }, true);
  }

  root.KnobNums = { bind: bind, parse: parse };
})(typeof globalThis !== 'undefined' ? globalThis : this);
