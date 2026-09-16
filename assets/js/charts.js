/* ============================================================
   ParDarshi — formatting helpers + dependency-free SVG charts
   Colors are CSS custom properties so light/dark swap for free.
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- formatting ---------------- */
  function indianGroup(x) {
    var s = String(x), neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    var p = s.split('.'), i = p[0];
    var last3 = i.slice(-3), rest = i.slice(0, -3);
    if (rest) last3 = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
    return (neg ? '-' : '') + last3 + (p[1] ? '.' + p[1] : '');
  }
  // n is in ₹ crore
  function cr(n) {
    if (n == null || isNaN(n)) return '—';
    var a = Math.abs(n);
    if (a >= 100000) return '₹' + (n / 100000).toFixed(2) + ' L Cr';
    if (a >= 1000)   return '₹' + indianGroup(Math.round(n)) + ' Cr';
    if (a >= 1)      return '₹' + indianGroup(n.toFixed(1).replace(/\.0$/, '')) + ' Cr';
    return '₹' + indianGroup(Math.round(n * 100)) + ' L';
  }
  function crShort(n) {
    var a = Math.abs(n);
    if (a >= 100000) return (n / 100000).toFixed(1) + 'L';
    if (a >= 1000) return indianGroup(Math.round(n));
    return String(Math.round(n));
  }
  function rupees(n) { return '₹' + indianGroup(Math.round(n)); }
  // full precision in crore — used by the live ticker, where the last digits move
  function crExact(n) { return '₹' + indianGroup(n.toFixed(2)) + ' Cr'; }
  function pct(n, d) { return (n == null || isNaN(n)) ? '—' : n.toFixed(d == null ? 1 : d) + '%'; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  global.FMT = { cr: cr, crExact: crExact, crShort: crShort, rupees: rupees, pct: pct, group: indianGroup, esc: esc };

  /* ---------------- shared tooltip ---------------- */
  var tip;
  function tipEl() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'pd-tip';
      tip.setAttribute('role', 'status');
      document.body.appendChild(tip);
    }
    return tip;
  }
  function showTip(html, x, y) {
    var t = tipEl();
    t.innerHTML = html;
    t.classList.add('on');
    var r = t.getBoundingClientRect();
    var left = x + 14, top = y - r.height - 12;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top < 8) top = y + 18;
    t.style.left = left + 'px';
    t.style.top = top + 'px';
  }
  function hideTip() { if (tip) tip.classList.remove('on'); }
  global.addEventListener('scroll', hideTip, true);

  /* ---------------- geometry helpers ---------------- */
  // Horizontal bar: square at the baseline (left), 4px rounded data-end (right).
  function hBarPath(x, y, w, h, r) {
    r = Math.min(r, w, h / 2);
    if (w <= 0.5) return '';
    if (w <= r) return 'M' + x + ',' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z';
    return 'M' + x + ',' + y +
      'H' + (x + w - r) + 'A' + r + ',' + r + ' 0 0 1 ' + (x + w) + ',' + (y + r) +
      'V' + (y + h - r) + 'A' + r + ',' + r + ' 0 0 1 ' + (x + w - r) + ',' + (y + h) +
      'H' + x + 'Z';
  }
  function niceTicks(max, count) {
    if (max <= 0) return [0];
    var raw = max / count;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    var out = [];
    for (var v = 0; v <= max * 1.0001; v += step) out.push(v);
    if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
    return out;
  }

  /* ============================================================
     1. Cumulative area/line chart with crosshair
     opts: { labels, series:[{key,name,values,role}], yFmt, tipFmt }
     role: 'primary' (area + line + end dot) | 'reference' (muted line)
     ============================================================ */
  function areaChart(host, opts) {
    var W = host.clientWidth || 720, H = opts.height || 260;
    var M = { t: 18, r: 54, b: 30, l: 56 };
    var iw = W - M.l - M.r, ih = H - M.t - M.b;
    var all = [];
    opts.series.forEach(function (s) {
      s.values.forEach(function (v) { if (v != null) all.push(v); });
    });
    var max = Math.max.apply(null, all);
    var ticks = niceTicks(max, 4);
    var top = ticks[ticks.length - 1];
    var X = function (i) { return M.l + (iw * i) / (opts.labels.length - 1); };
    var Y = function (v) { return M.t + ih - (ih * v) / top; };

    var svg = ['<svg class="pd-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="' + esc(opts.aria || 'chart') + '">'];

    // gridlines — hairline, solid, recessive
    ticks.forEach(function (t) {
      svg.push('<line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) +
        '" stroke="var(--grid)" stroke-width="1"/>');
      svg.push('<text class="pd-ax" x="' + (M.l - 10) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end">' +
        esc(opts.yFmt ? opts.yFmt(t) : crShort(t)) + '</text>');
    });
    // x labels
    opts.labels.forEach(function (l, i) {
      svg.push('<text class="pd-ax" x="' + X(i).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(l) + '</text>');
    });

    opts.series.forEach(function (s) {
      var pts = [];
      s.values.forEach(function (v, i) { if (v != null) pts.push([X(i), Y(v), i, v]); });
      if (!pts.length) return;
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('');
      if (s.role === 'primary') {
        var area = d + 'L' + pts[pts.length - 1][0].toFixed(1) + ',' + Y(0).toFixed(1) +
                   'L' + pts[0][0].toFixed(1) + ',' + Y(0).toFixed(1) + 'Z';
        svg.push('<path d="' + area + '" fill="var(--series-1)" fill-opacity="0.10"/>');
        svg.push('<path d="' + d + '" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');
        var last = pts[pts.length - 1];
        svg.push('<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) +
          '" r="4.5" fill="var(--series-1)" stroke="var(--surface-1)" stroke-width="2"/>');
        // one selective direct label: the endpoint
        svg.push('<text class="pd-endlabel" x="' + (last[0] + 9).toFixed(1) + '" y="' + (last[1] + 4).toFixed(1) + '">' +
          esc(opts.yFmt ? opts.yFmt(last[3]) : crShort(last[3])) + '</text>');
      } else {
        svg.push('<path d="' + d + '" fill="none" stroke="var(--ref-line)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');
      }
    });

    // crosshair + hit layer
    svg.push('<line class="pd-cross" x1="0" x2="0" y1="' + M.t + '" y2="' + (M.t + ih) + '" stroke="var(--axis)" stroke-width="1" opacity="0"/>');
    svg.push('<rect x="' + M.l + '" y="' + M.t + '" width="' + iw + '" height="' + ih + '" fill="transparent" class="pd-hit"/>');
    svg.push('</svg>');
    host.innerHTML = svg.join('');

    var el = host.querySelector('svg');
    var cross = el.querySelector('.pd-cross');
    var hit = el.querySelector('.pd-hit');
    function at(evt) {
      var box = el.getBoundingClientRect();
      var px = (evt.clientX - box.left) * (W / box.width);
      var i = Math.round(((px - M.l) / iw) * (opts.labels.length - 1));
      i = Math.max(0, Math.min(opts.labels.length - 1, i));
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i));
      cross.setAttribute('opacity', '1');
      var rows = opts.series.map(function (s) {
        var v = s.values[i];
        return '<div class="pd-tip-row"><span class="pd-key" style="background:' +
          (s.role === 'primary' ? 'var(--series-1)' : 'var(--ref-line)') + '"></span>' +
          esc(s.name) + '<b>' + (v == null ? 'no data' : esc(opts.yFmt ? opts.yFmt(v) : cr(v))) + '</b></div>';
      }).join('');
      showTip('<div class="pd-tip-h">' + esc(opts.labels[i]) + '</div>' + rows, evt.clientX, evt.clientY);
    }
    hit.addEventListener('mousemove', at);
    hit.addEventListener('mouseleave', function () { cross.setAttribute('opacity', '0'); hideTip(); });
  }

  /* ============================================================
     2. Horizontal bar chart — single series, value at the tip
     rows: [{label, value, meta}]
     ============================================================ */
  function barsH(host, opts) {
    var rows = opts.rows;
    var W = host.clientWidth || 620;
    var rowH = opts.rowH || 30, barH = Math.min(18, rowH - 12);
    var M = { t: 6, r: 96, b: 6, l: opts.labelW || 190 };
    var H = M.t + M.b + rows.length * rowH;
    var iw = W - M.l - M.r;
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }));
    var svg = ['<svg class="pd-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="' + esc(opts.aria || 'bar chart') + '">'];
    rows.forEach(function (r, i) {
      var y = M.t + i * rowH, w = max > 0 ? (iw * r.value) / max : 0;
      var by = y + (rowH - barH) / 2;
      svg.push('<text class="pd-cat" x="' + (M.l - 12) + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="end">' + esc(r.label) + '</text>');
      svg.push('<path class="pd-bar" data-i="' + i + '" d="' + hBarPath(M.l, by, w, barH, 4) + '" fill="' + (r.color || 'var(--series-1)') + '"/>');
      svg.push('<text class="pd-val" x="' + (M.l + w + 10) + '" y="' + (y + rowH / 2 + 4) + '">' +
        esc(opts.vFmt ? opts.vFmt(r.value) : cr(r.value)) + '</text>');
      // generous hit target spanning the whole row
      svg.push('<rect class="pd-hit-row" data-i="' + i + '" x="' + M.l + '" y="' + y + '" width="' + iw + '" height="' + rowH + '" fill="transparent"/>');
    });
    svg.push('</svg>');
    host.innerHTML = svg.join('');
    host.querySelectorAll('.pd-hit-row').forEach(function (n) {
      n.addEventListener('mousemove', function (e) {
        var r = rows[+n.dataset.i];
        showTip('<div class="pd-tip-h">' + esc(r.label) + '</div><div class="pd-tip-row">' +
          esc(opts.valueName || 'Amount') + '<b>' + esc(opts.vFmt ? opts.vFmt(r.value) : cr(r.value)) + '</b></div>' +
          (r.meta ? '<div class="pd-tip-meta">' + r.meta + '</div>' : ''), e.clientX, e.clientY);
      });
      n.addEventListener('mouseleave', hideTip);
    });
  }

  /* ============================================================
     3. Stacked status bar — verified / awaiting / flagged
     Status colors ship with icon + label (never colour alone).
     ============================================================ */
  function stackedStatus(host, opts) {
    var rows = opts.rows;                       // [{label, segs:[{key,name,value}], total}]
    var W = host.clientWidth || 620;
    var rowH = 34, barH = 16, GAP = 2;
    var M = { t: 4, r: 108, b: 4, l: opts.labelW || 152 };
    var H = M.t + M.b + rows.length * rowH;
    var iw = W - M.l - M.r;
    var COLOR = { ok: 'var(--st-good)', wait: 'var(--st-warning)', flag: 'var(--st-critical)' };
    var svg = ['<svg class="pd-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="' + esc(opts.aria || 'status breakdown') + '">'];
    rows.forEach(function (r, i) {
      var y = M.t + i * rowH, by = y + (rowH - barH) / 2, x = M.l;
      svg.push('<text class="pd-cat" x="' + (M.l - 12) + '" y="' + (y + rowH / 2 + 4) + '" text-anchor="end">' + esc(r.label) + '</text>');
      var nz = r.segs.filter(function (s) { return s.value > 0; });
      nz.forEach(function (s, si) {
        var w = (iw * s.value) / r.total;
        var last = si === nz.length - 1;
        var drawW = last ? w : Math.max(0, w - GAP);   // 2px surface gap between segments
        // The bar grows from a baseline at zero: square at the left, 4px rounded
        // only on the final data-end.
        var d = last ? hBarPath(x, by, drawW, barH, 4)
                     : 'M' + x + ',' + by + 'h' + drawW + 'v' + barH + 'h' + (-drawW) + 'Z';
        if (drawW > 0.5) {
          svg.push('<path d="' + d + '" fill="' + COLOR[s.key] + '" data-r="' + i + '" data-s="' + si + '" class="pd-seg"/>');
        }
        x += w;
      });
      svg.push('<text class="pd-val" x="' + (W - M.r + 12) + '" y="' + (y + rowH / 2 + 4) + '">' +
        esc(pct(100 * r.segs[0].value / r.total, 1)) + ' clean</text>');
      svg.push('<rect class="pd-hit-row" data-i="' + i + '" x="' + M.l + '" y="' + y + '" width="' + iw + '" height="' + rowH + '" fill="transparent"/>');
    });
    svg.push('</svg>');
    host.innerHTML = svg.join('');
    var ICON = { ok: '✓', wait: '◷', flag: '!' };
    host.querySelectorAll('.pd-hit-row').forEach(function (n) {
      n.addEventListener('mousemove', function (e) {
        var r = rows[+n.dataset.i];
        var body = r.segs.map(function (s) {
          return '<div class="pd-tip-row"><span class="pd-key" style="background:' + COLOR[s.key] + '"></span>' +
            ICON[s.key] + ' ' + esc(s.name) + '<b>' + esc(cr(s.value)) + '</b></div>';
        }).join('');
        showTip('<div class="pd-tip-h">' + esc(r.label) + '</div>' + body, e.clientX, e.clientY);
      });
      n.addEventListener('mouseleave', hideTip);
    });
  }

  /* ============================================================
     4. Sparkline (12 points) for stat tiles
     ============================================================ */
  function sparkline(values, w, h) {
    w = w || 108; h = h || 30;
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    var span = (max - min) || 1;
    var d = values.map(function (v, i) {
      var x = (w * i) / (values.length - 1);
      var y = h - 3 - ((h - 6) * (v - min)) / span;
      return (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join('');
    var lx = w, ly = h - 3 - ((h - 6) * (values[values.length - 1] - min)) / span;
    return '<svg class="pd-spark" viewBox="0 0 ' + (w + 6) + ' ' + h + '" width="' + (w + 6) + '" height="' + h + '" aria-hidden="true">' +
      '<path d="' + d + '" fill="none" stroke="var(--spark)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="3" fill="var(--series-1)"/></svg>';
  }

  /* ============================================================
     5. Meter — fill carries severity, track is a lighter step
     ============================================================ */
  function meter(pctVal, severityKey) {
    var v = Math.max(0, Math.min(100, pctVal));
    var fill = severityKey === 'flag' ? 'var(--st-critical)'
             : severityKey === 'wait' ? 'var(--st-warning)' : 'var(--series-1)';
    return '<span class="pd-meter" role="img" aria-label="' + v.toFixed(0) + ' percent">' +
      '<span class="pd-meter-fill" style="width:' + v + '%;background:' + fill + '"></span></span>';
  }

  global.CHARTS = {
    areaChart: areaChart, barsH: barsH, stackedStatus: stackedStatus,
    sparkline: sparkline, meter: meter, hideTip: hideTip, showTip: showTip
  };
})(window);
