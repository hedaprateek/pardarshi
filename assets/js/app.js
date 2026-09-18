/* ============================================================
   ParDarshi — application logic
   ============================================================ */
(function () {
  'use strict';

  var D = window.PD, C = window.CHARTS, F = window.FMT;
  var esc = F.esc, cr = F.cr;

  var S = {
    view: 'dashboard',
    tol: 1.0,
    state: '',
    q: '',
    node: 'IN',
    ledgerN: 40,
    spendN: 40,
    taxpayer: 0,
    repHouse: '',
    repSort: 'score',
    flagFilter: 'all',
    ledgerFilter: 'all',
    spendFilter: 'all',
    mapDepth: 4,        // tiers shown below the Union band
    mapAgg: false,      // include the untraced remainder at true proportion
    mapBroken: false,   // dim everything except the broken chains
    mapPick: null,      // node the map is focused on
    mapMonth: null,     // null = whole year so far, else 0..5 (Apr..Sep)
    playing: false      // tolerance sweep running
  };

  /* ================= status engine ================= */
  // Deviation between what the sender released and what the receiver signed for.
  function dev(sent, acked) {
    if (acked == null || !sent) return null;
    return ((acked - sent) / sent) * 100;
  }
  function txnDev(t) { return t.pending ? null : dev(t.amount, t.ackAmount); }

  // Effective status, given the permitted deviation currently in force.
  // A breach opens a case; an accepted justification closes it back to green.
  function statusOf(t) {
    if (t.pending) return { key: 'wait', stage: 'pending', label: 'Awaiting acknowledgement', short: 'Pending', icon: '◷' };
    var d = txnDev(t);
    if (Math.abs(d) <= S.tol) return { key: 'ok', stage: 'clean', label: 'Verified', short: 'Verified', icon: '✓' };
    var c = t.caseNarrative;
    if (!c.repliedOn) return { key: 'flag', stage: 'open', label: 'Show-cause issued', short: 'Notice', icon: '!' };
    if (c.justified)  return { key: 'ok', stage: 'justified', label: 'Justified — closed', short: 'Justified', icon: '✓' };
    return { key: 'flag', stage: 'action', label: 'Legal action', short: 'Action', icon: '!' };
  }
  /* ---- the same rules, rewound to a point in the year ----
     Used by the chain map's month scrubber. With no month selected the cutoff
     is open and this reduces exactly to statusOf(). */
  var MON = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
  function ordOf(s) { var p = s.split('-'); return (+p[1] - 4) * 28 + (+p[0] - 1); }
  function cutoff() { return S.mapMonth == null ? 1e9 : S.mapMonth * 28 + 27; }
  function released(t) { return t.sentOrd <= cutoff(); }

  function statusAsOf(t) {
    var cut = cutoff();
    if (t.sentOrd > cut) return null;                       // not yet released
    if (t.pending || !t.ackOn || t.ackOrd > cut)
      return { key: 'wait', stage: 'pending', label: 'Awaiting acknowledgement', short: 'Pending', icon: '◷' };
    var d = txnDev(t);
    if (Math.abs(d) <= S.tol) return { key: 'ok', stage: 'clean', label: 'Verified', short: 'Verified', icon: '✓' };
    var c = t.caseNarrative;
    if (!c.repliedOn || ordOf(c.repliedOn) > cut)
      return { key: 'flag', stage: 'open', label: 'Show-cause issued', short: 'Notice', icon: '!' };
    if (c.justified) return { key: 'ok', stage: 'justified', label: 'Justified — closed', short: 'Justified', icon: '✓' };
    return { key: 'flag', stage: 'action', label: 'Legal action', short: 'Action', icon: '!' };
  }

  function spendStatus(s) {
    if (s.vendorAck == null) return { key: 'wait', label: 'Vendor ack pending', icon: '◷' };
    var d = dev(s.amount, s.vendorAck);
    return Math.abs(d) <= S.tol
      ? { key: 'ok', label: 'Reconciled', icon: '✓' }
      : { key: 'flag', label: 'Bill mismatch', icon: '!' };
  }
  function pill(st) {
    return '<span class="pill ' + st.key + '"><i>' + st.icon + '</i>' + esc(st.label) + '</span>';
  }
  function devText(d) {
    if (d == null) return '<span class="sub">—</span>';
    var s = (d > 0 ? '+' : '') + d.toFixed(2) + '%';
    return Math.abs(d) > S.tol ? '<b style="color:var(--st-critical)">' + s + '</b>' : '<span class="sub">' + s + '</span>';
  }

  /* ================= indexes ================= */
  var nodes = D.nodes;
  var byDistrict = {}, byTaluka = {}, projectsOf = {};
  Object.keys(nodes).forEach(function (id) {
    var n = nodes[id];
    if (n.tier === 'district') byDistrict[n.state + '|' + n.district] = n;
    if (n.tier === 'taluka')   byTaluka[n.state + '|' + n.district + '|' + n.taluka] = n;
  });
  function descendants(id, out) {
    out = out || [];
    (nodes[id].children || []).forEach(function (c) { out.push(nodes[c]); descendants(c, out); });
    return out;
  }
  Object.keys(nodes).forEach(function (id) {
    if (nodes[id].tier === 'district' || nodes[id].tier === 'taluka') {
      projectsOf[id] = descendants(id).filter(function (n) { return n.tier === 'project'; });
    }
  });

  function stateOfTxn(t) { var n = nodes[t.to]; return n ? (n.state || '') : ''; }
  function inScope(stateName) { return !S.state || S.state === stateName; }

  function scopedTxns() {
    return D.txns.filter(function (t) {
      if (S.state && stateOfTxn(t) !== S.state) return false;
      return true;
    });
  }
  function scopedSpends() {
    return D.spends.filter(function (s) { return !S.state || s.state === S.state; });
  }
  function matches(hay) {
    if (!S.q) return true;
    return hay.toLowerCase().indexOf(S.q.toLowerCase()) !== -1;
  }

  /* ================= chrome ================= */
  function initChrome() {
    document.querySelectorAll('.fy').forEach(function (n) { n.textContent = D.META.fy; });
    document.getElementById('fyLabel').textContent = D.META.fy;
    document.getElementById('asOfLabel').textContent = D.META.asOf;

    var sel = document.getElementById('fState');
    D.GEO.forEach(function (g) {
      var o = document.createElement('option');
      o.value = g.state; o.textContent = g.state; sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      S.state = sel.value; S.ledgerN = 40; S.spendN = 40;
      if (S.state) {
        var g = D.GEO.filter(function (x) { return x.state === S.state; })[0];
        S.node = 'IN/' + g.code;
      } else S.node = 'IN';
      renderAll();
    });

    var tol = document.getElementById('fTol'), tolv = document.getElementById('tolVal');
    tol.addEventListener('input', function () {
      S.tol = parseFloat(tol.value);
      tolv.textContent = S.tol.toFixed(1) + '%';
      renderAll();
    });

    /* ---- the sweep ----
       Drives the permitted deviation from 0% to 3% and settles back at 1%.
       The whole argument for the margin in about seven seconds: at 0% the map
       is almost entirely red, by 1% only genuine gaps remain, and past that
       widening buys nothing. */
    var playBtn = document.getElementById('tolPlay'), sweepTimer = null;
    function stopSweep() {
      if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
      S.playing = false;
      playBtn.textContent = '▶';
      playBtn.setAttribute('aria-label', 'Play the permitted-deviation sweep');
    }
    function startSweep() {
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var seq = [];
      if (reduced) seq = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 1];
      else {
        for (var k = 0; k <= 60; k++) seq.push(Math.round(k * 5) / 100);
        seq = seq.concat([3, 3, 3, 1]);                 // hold at the top, then settle
      }
      var i = 0;
      S.playing = true;
      playBtn.textContent = '■';
      playBtn.setAttribute('aria-label', 'Stop the sweep');
      sweepTimer = setInterval(function () {
        if (i >= seq.length) { stopSweep(); return; }
        S.tol = seq[i++];
        tol.value = String(S.tol);
        tolv.textContent = S.tol.toFixed(1) + '%';
        renderAll();
      }, reduced ? 850 : 110);
    }
    playBtn.addEventListener('click', function () { S.playing ? stopSweep() : startSweep(); });
    tol.addEventListener('pointerdown', stopSweep);   // taking the slider cancels playback

    var q = document.getElementById('fSearch'), qt;
    q.addEventListener('input', function () {
      clearTimeout(qt);
      qt = setTimeout(function () { S.q = q.value.trim(); S.ledgerN = 40; S.spendN = 40; renderAll(); }, 160);
    });

    var VIEWS = ['dashboard', 'map', 'flow', 'ledger', 'flags', 'spend', 'reps', 'mytax', 'how'];
    function applyView(v, scroll) {
      // "#flow:IN/MH/Pune" deep-links straight to a node in the chain
      var colon = v.indexOf(':');
      if (colon !== -1) {
        var target = decodeURIComponent(v.slice(colon + 1));
        v = v.slice(0, colon);
        if (nodes[target]) S.node = target;
      }
      if (VIEWS.indexOf(v) === -1) v = 'dashboard';
      S.view = v;
      document.querySelectorAll('.tab').forEach(function (x) { x.setAttribute('aria-selected', String(x.dataset.view === v)); });
      document.querySelectorAll('.view').forEach(function (n) { n.classList.toggle('on', n.id === 'view-' + v); });
      C.hideTip();
      renderAll();
      if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () {
        location.hash = b.dataset.view;      // hash routing keeps every tab linkable
        applyView(b.dataset.view, true);
      });
    });
    window.addEventListener('hashchange', function () { applyView(location.hash.slice(1), true); });
    if (location.hash.length > 1) applyView(location.hash.slice(1), false);

    // ?theme=light|dark forces a mode — handy for projectors and screenshots
    var forced = (location.search.match(/[?&]theme=(light|dark)/) || [])[1];
    var saved = forced || localStorage.getItem('pd-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    document.getElementById('themeBtn').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var isDark = cur ? cur === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
      var next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('pd-theme', next);
      renderAll();
    });

    // chart table-view twins
    document.querySelectorAll('[data-table]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = document.getElementById(b.dataset.table);
        var on = t.classList.toggle('on');
        b.setAttribute('aria-pressed', String(on));
      });
    });

    window.addEventListener('resize', debounce(renderAll, 180));
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  function table(headers, rows) {
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      headers.map(function (h) { return '<th' + (h.num ? ' class="num"' : '') + '>' + esc(h.t) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }

  /* ================= DASHBOARD ================= */
  function renderDashboard() {
    var T = D.TREASURY;

    // hero — live accumulating counter
    var heroBase = T.collectedYTD;
    var el = document.getElementById('heroValue');
    var start = Date.now();
    if (window.__pdTick) clearInterval(window.__pdTick);
    function tick() {
      var add = ((Date.now() - start) / 1000) * T.perSecond;
      el.textContent = F.crExact(heroBase + add);
    }
    tick();
    window.__pdTick = setInterval(tick, 1000);
    document.getElementById('heroNote').textContent =
      'Accruing at about ' + cr(T.perSecond * 60) + ' a minute · opening balance ' + cr(T.openingBalance);

    document.getElementById('tBalance').textContent = cr(T.balance);
    // only the transfers that actually leave the Union treasury
    var tracedTotal = D.txns.filter(function (t) { return t.from === 'IN'; })
      .reduce(function (a, t) { return a + t.amount; }, 0);
    document.getElementById('tTraced').textContent = cr(tracedTotal);
    document.getElementById('tTracedNote').textContent =
      F.pct(100 * tracedTotal / T.disbursed) + ' of all disbursals, across ' + D.GEO.length + ' states';

    // KPI tiles
    var tx = scopedTxns();
    var agg = { ok: 0, wait: 0, flag: 0, okN: 0, waitN: 0, flagN: 0, justified: 0, action: 0 };
    tx.forEach(function (t) {
      var st = statusOf(t);
      agg[st.key] += t.amount; agg[st.key + 'N']++;
      if (st.stage === 'justified') agg.justified += t.amount;
      if (st.stage === 'action') agg.action += t.amount;
    });
    var total = agg.ok + agg.wait + agg.flag;
    var tiles = [
      { l: 'Verified &amp; reconciled', v: cr(agg.ok), m: 100 * agg.ok / total, k: null,
        d: agg.okN + ' transfers · ' + F.pct(100 * agg.ok / total) + ' of money moved' },
      { l: 'Awaiting acknowledgement', v: cr(agg.wait), m: 100 * agg.wait / total, k: 'wait',
        d: agg.waitN + ' receipts not yet signed for' },
      { l: 'Flagged — under notice', v: cr(agg.flag), m: 100 * agg.flag / total, k: 'flag',
        d: agg.flagN + ' transfers breach the ' + S.tol.toFixed(1) + '% margin' },
      { l: 'Closed after justification', v: cr(agg.justified), m: 100 * agg.justified / total, k: null,
        d: 'Explanations accepted on record' }
    ];
    document.getElementById('kpis').innerHTML = tiles.map(function (t) {
      return '<div class="card"><div class="tile-label">' + t.l + '</div>' +
        '<div class="tile-value">' + t.v + '</div>' +
        '<div class="tile-foot"><span class="tile-delta">' + esc(t.d) + '</span></div>' +
        '<div style="margin-top:8px">' + C.meter(t.m, t.k) + '</div></div>';
    }).join('');

    // accumulation
    var accum = document.getElementById('chAccum');
    C.areaChart(accum, {
      labels: D.MONTHS, height: 268, aria: 'Cumulative net tax receipts by month',
      yFmt: function (v) { return v >= 100000 ? (v / 100000).toFixed(1) + 'L Cr' : F.group(Math.round(v)); },
      series: [
        { name: 'FY 2025-26 (completed)', values: D.CUM_PREV, role: 'reference' },
        { name: 'FY ' + D.META.fy + ' (to date)', values: D.CUM_CURR.concat([null, null, null, null, null, null]), role: 'primary' }
      ]
    });
    document.getElementById('tblAccum').innerHTML = table(
      [{ t: 'Month' }, { t: 'FY ' + D.META.fy, num: true }, { t: 'FY 2025-26', num: true }],
      D.MONTHS.map(function (m, i) {
        return '<tr><td>' + m + '</td><td class="num">' + (D.CUM_CURR[i] == null ? '—' : cr(D.CUM_CURR[i])) +
          '</td><td class="num">' + cr(D.CUM_PREV[i]) + '</td></tr>';
      })
    );

    // status by state
    var rows = D.GEO.filter(function (g) { return inScope(g.state); }).map(function (g) {
      var seg = { ok: 0, wait: 0, flag: 0 };
      D.txns.forEach(function (t) {
        if (stateOfTxn(t) !== g.state) return;
        seg[statusOf(t).key] += t.amount;
      });
      var tot = seg.ok + seg.wait + seg.flag;
      return { label: g.state, total: tot || 1, segs: [
        { key: 'ok', name: 'Verified', value: seg.ok },
        { key: 'wait', name: 'Awaiting acknowledgement', value: seg.wait },
        { key: 'flag', name: 'Flagged', value: seg.flag }
      ] };
    }).sort(function (a, b) { return (b.segs[0].value / b.total) - (a.segs[0].value / a.total); });
    C.stackedStatus(document.getElementById('chStatus'), { rows: rows, aria: 'Transfer status by state' });
    document.getElementById('tblStatus').innerHTML = table(
      [{ t: 'State' }, { t: 'Verified', num: true }, { t: 'Awaiting', num: true }, { t: 'Flagged', num: true }, { t: 'Clean %', num: true }],
      rows.map(function (r) {
        return '<tr><td>' + esc(r.label) + '</td><td class="num">' + cr(r.segs[0].value) +
          '</td><td class="num">' + cr(r.segs[1].value) + '</td><td class="num">' + cr(r.segs[2].value) +
          '</td><td class="num">' + F.pct(100 * r.segs[0].value / r.total) + '</td></tr>';
      })
    );

    // union heads
    C.barsH(document.getElementById('chHeads'), {
      rows: D.UNION_HEADS.map(function (h) { return { label: h.head, value: h.amount }; }),
      labelW: 210, rowH: 34, aria: 'Union disbursals by head of account', valueName: 'Disbursed'
    });

    // expenditure by sector
    var byCat = {};
    scopedSpends().forEach(function (s) { byCat[s.category] = (byCat[s.category] || 0) + s.amount; });
    var catRows = Object.keys(byCat).map(function (k) { return { label: k, value: byCat[k] }; })
      .sort(function (a, b) { return b.value - a.value; });
    C.barsH(document.getElementById('chCat'), {
      rows: catRows, labelW: 210, rowH: 32, aria: 'Expenditure by sector', valueName: 'Billed'
    });
    var catTot = catRows.reduce(function (a, r) { return a + r.value; }, 0);
    document.getElementById('tblCat').innerHTML = table(
      [{ t: 'Sector' }, { t: 'Billed', num: true }, { t: 'Share', num: true }],
      catRows.map(function (r) {
        return '<tr><td>' + esc(r.label) + '</td><td class="num">' + cr(r.value) +
          '</td><td class="num">' + F.pct(100 * r.value / catTot) + '</td></tr>';
      })
    );
  }

  /* ================= FUND FLOW ================= */
  var TIER_LABEL = { union: 'Union', state: 'State', district: 'District', taluka: 'Taluka / Block', project: 'Project', aggregate: 'Aggregate' };

  // Navigate the chain and keep the URL in step, without re-entering the router.
  function goNode(id) {
    S.node = id;
    try { history.replaceState(null, '', '#flow:' + encodeURIComponent(id)); } catch (e) {}
    renderFlow();
  }

  function pathTo(id) {
    var p = [], cur = id;
    while (cur) { p.unshift(cur); cur = nodes[cur].parent; }
    return p;
  }

  function renderFlow() {
    if (!nodes[S.node]) S.node = 'IN';
    var path = pathTo(S.node);
    var chain = document.getElementById('chain');
    var html = '';
    path.forEach(function (id, i) {
      var n = nodes[id];
      if (i > 0) {
        var t = D.txnByTo[id], st = statusOf(t);
        html += '<div class="chain-link link-' + st.key + '" title="' + esc(st.label) + '">' +
          '<span class="bar"></span><span class="tagl">' + st.icon + ' ' + esc(st.short) + '</span></div>';
      }
      html += '<button class="chain-node" data-id="' + esc(id) + '"' + (id === S.node ? ' aria-current="true"' : '') + '>' +
        '<div class="chain-tier">' + esc(TIER_LABEL[n.tier]) + '</div>' +
        '<div class="chain-name">' + esc(n.short) + '</div>' +
        '<div class="chain-amt">' + cr(n.received) + '</div></button>';
    });
    chain.innerHTML = html;
    chain.querySelectorAll('.chain-node').forEach(function (b) {
      b.addEventListener('click', function () { goNode(b.dataset.id); });
    });

    var n = nodes[S.node];
    document.getElementById('nodeTitle').textContent = n.name;
    document.getElementById('nodeSub').textContent =
      [TIER_LABEL[n.tier], n.state, n.district, n.taluka].filter(Boolean).join(' · ') +
      (n.category ? ' · ' + n.category : '');

    var kv = [];
    kv.push(['Received', cr(n.received)]);
    if (n.retained != null) kv.push(['Retained at this level', cr(n.retained)]);
    var devolved = (n.children || []).reduce(function (a, c) { return a + nodes[c].received; }, 0);
    if (devolved > 0) kv.push(['Released onward', cr(devolved)]);
    if (n.spent != null) { kv.push(['Spent against bills', cr(n.spent)]); kv.push(['Unspent balance', cr(n.unspent)]); }
    if (n.physicalProgress != null) kv.push(['Physical progress', n.physicalProgress + '%']);
    if (n.engineer) kv.push(['Officer responsible', n.engineer]);
    document.getElementById('nodeKv').innerHTML = kv.map(function (r) {
      return '<dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd>';
    }).join('');

    // the receipt that brought money into this node
    var rec = document.getElementById('nodeReceipt');
    if (n.parent) {
      var t = D.txnByTo[S.node], st = statusOf(t), d = txnDev(t);
      var body = '<div class="notice"><b>Acknowledgement receipt</b>' +
        '<div class="kv" style="grid-template-columns:auto 1fr">' +
        '<dt>Sender</dt><dd style="text-align:left">' + esc(nodes[t.from].short) + '</dd>' +
        '<dt>Released</dt><dd>' + cr(t.amount) + ' on ' + esc(t.sentOn) + '</dd>' +
        '<dt>Acknowledged</dt><dd>' + (t.pending ? '<span class="sub">not yet signed</span>' : cr(t.ackAmount) + ' on ' + esc(t.ackOn)) + '</dd>' +
        '<dt>Deviation</dt><dd>' + devText(d) + '</dd>' +
        '<dt>Sanction</dt><dd class="mono" style="text-align:left">' + esc(t.sanction) + '</dd>' +
        '<dt>Bank reference</dt><dd class="mono" style="text-align:left">' + esc(t.utr) + '</dd>' +
        '</div><div style="margin-top:10px">' + pill(st) + '</div>';
      if (st.stage === 'open' || st.stage === 'action' || st.stage === 'justified') {
        body += '<div style="margin-top:10px;font-size:12.5px;color:var(--text-secondary)">' +
          '<b style="color:var(--muted)">Notice ' + esc(t.caseNarrative.noticeNo) + ' · issued ' + esc(t.caseNarrative.noticeOn) + '</b>' +
          esc(t.caseNarrative.explanation) +
          (st.stage === 'action' ? '<div style="margin-top:6px;color:var(--st-critical)"><b>Action: </b>' + esc(t.caseNarrative.action) + '</div>' : '') +
          '</div>';
      }
      body += '</div>';
      rec.innerHTML = body;
    } else {
      rec.innerHTML = '<div class="notice"><b>Source of funds</b>Net tax receipts credited to the Consolidated Fund of India. ' +
        'Nothing above this tier — this is where every rupee on this site enters the chain.</div>';
    }

    // children
    var drill = document.getElementById('drill');
    var kids = n.children || [];
    document.getElementById('childTitle').textContent = n.tier === 'project' ? 'Bills raised' : 'Onward releases';
    if (n.tier === 'project') {
      var sp = D.spendsByProject[n.id] || [];
      document.getElementById('childSub').textContent = sp.length + ' bills recorded against this work.';
      drill.style.gridTemplateColumns = '1fr';
      drill.innerHTML = sp.map(function (s) {
        var st = spendStatus(s);
        return '<div class="drill-row" style="cursor:default">' +
          '<span><span class="nm">' + esc(s.item) + '</span><br><span class="sub">' + esc(s.vendor) + ' · ' + esc(s.id) + ' · ' + esc(s.billedOn) + '</span></span>' +
          '<span class="rt"><b>' + cr(s.amount) + '</b><br>' + pill(st) + '</span></div>';
      }).join('') || '<div class="empty">No bills recorded yet.</div>';
      return;
    }
    document.getElementById('childSub').textContent = kids.length + ' onward transfers. Select any row to drill one tier deeper.';
    drill.style.gridTemplateColumns = '';
    drill.innerHTML = kids.map(function (id) {
      var c = nodes[id], t = D.txnByTo[id], st = statusOf(t);
      return '<button class="drill-row' + (c.aggregate ? ' agg' : '') + '" data-id="' + esc(id) + '">' +
        '<span><span class="nm">' + esc(c.short) + '</span><br>' + pill(st) + '</span>' +
        '<span class="rt"><b>' + cr(c.received) + '</b><br><span class="sub">' + devText(txnDev(t)) + '</span></span>' +
        '</button>';
    }).join('') || '<div class="empty">Terminal node.</div>';
    drill.querySelectorAll('.drill-row[data-id]').forEach(function (b) {
      b.addEventListener('click', function () { goNode(b.dataset.id); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    });
  }

  /* ================= LEDGER ================= */
  function renderLedger() {
    var f = document.getElementById('ledgerFilters');
    if (!f.dataset.built) {
      f.innerHTML = ['all', 'ok', 'wait', 'flag'].map(function (k) {
        var lbl = { all: 'All', ok: '✓ Verified', wait: '◷ Awaiting', flag: '! Flagged' }[k];
        return '<button class="mini-btn" data-lf="' + k + '">' + lbl + '</button>';
      }).join('');
      f.dataset.built = '1';
      f.querySelectorAll('[data-lf]').forEach(function (b) {
        b.addEventListener('click', function () { S.ledgerFilter = b.dataset.lf; S.ledgerN = 40; renderLedger(); });
      });
    }
    f.querySelectorAll('[data-lf]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.lf === S.ledgerFilter));
    });

    var list = scopedTxns().filter(function (t) {
      var st = statusOf(t);
      if (S.ledgerFilter !== 'all' && st.key !== S.ledgerFilter) return false;
      return matches(t.id + ' ' + nodes[t.from].short + ' ' + nodes[t.to].short + ' ' + t.purpose + ' ' + t.sanction);
    }).sort(function (a, b) { return b.amount - a.amount; });

    document.getElementById('ledgerCount').textContent =
      F.group(list.length) + ' transfers · ' + cr(list.reduce(function (a, t) { return a + t.amount; }, 0)) +
      ' moved · permitted deviation ' + S.tol.toFixed(1) + '%';

    var slice = list.slice(0, S.ledgerN);
    document.getElementById('ledgerTbl').innerHTML =
      '<thead><tr><th>Transaction</th><th>From → To</th><th>Tier</th>' +
      '<th class="num">Released</th><th class="num">Acknowledged</th><th class="num">Deviation</th><th>Status</th></tr></thead><tbody>' +
      slice.map(function (t) {
        var st = statusOf(t);
        return '<tr><td><span class="mono">' + esc(t.id) + '</span><br><span class="sub">' + esc(t.sentOn) + '</span></td>' +
          '<td>' + esc(nodes[t.from].short) + ' <span class="sub">→</span> ' + esc(nodes[t.to].short) +
          '<br><span class="sub">' + esc(t.purpose) + '</span></td>' +
          '<td><span class="chip">' + esc(TIER_LABEL[t.tier]) + '</span></td>' +
          '<td class="num">' + cr(t.amount) + '</td>' +
          '<td class="num">' + (t.pending ? '<span class="sub">pending</span>' : cr(t.ackAmount)) + '</td>' +
          '<td class="num">' + devText(txnDev(t)) + '</td>' +
          '<td>' + pill(st) + '</td></tr>';
      }).join('') + '</tbody>';
    var more = document.getElementById('ledgerMore');
    more.style.display = list.length > S.ledgerN ? '' : 'none';
    more.textContent = 'Show more (' + F.group(list.length - S.ledgerN) + ' remaining)';
    more.onclick = function () { S.ledgerN += 60; renderLedger(); };
  }

  /* ================= DISCREPANCY FLOWCHART =================
     The rule drawn as the decision tree it actually is, with live counts on
     every branch and connector thickness set by how many transfers take that
     route. Going down the spine means "still unresolved"; every branch to the
     right is an exit. ============================================ */
  function flowCounts() {
    var c = { total: 0, ack: 0, wait: 0, ok: 0, breach: 0, open: 0, replied: 0, justified: 0, action: 0, agg: 0 };
    var amt = { total: 0, wait: 0, ok: 0, breach: 0, open: 0, justified: 0, action: 0 };
    scopedTxns().forEach(function (t) {
      c.total++; amt.total += t.amount;
      if (nodes[t.to] && nodes[t.to].aggregate) c.agg++;
      var st = statusOf(t);
      if (st.key === 'wait') { c.wait++; amt.wait += t.amount; return; }
      c.ack++;
      if (st.stage === 'clean') { c.ok++; amt.ok += t.amount; return; }
      c.breach++; amt.breach += t.amount;
      if (st.stage === 'open') { c.open++; amt.open += t.amount; return; }
      c.replied++;
      if (st.stage === 'justified') { c.justified++; amt.justified += t.amount; }
      else { c.action++; amt.action += t.amount; }
    });
    c.amt = amt;
    return c;
  }

  function renderFlowchart() {
    var host = document.getElementById('flowchart');
    if (!host) return;
    var c = flowCounts();
    var VW = 790, ROW = 82, BX = 22, BW = 300, RX = 456, RW = 310, BH = 60;
    var rows = 7, VH = 12 + rows * ROW;
    var cxSpine = BX + BW / 2;

    var s = ['<svg class="pd-svg pd-flow" viewBox="0 0 ' + VW + ' ' + VH + '" width="100%" ' +
      'preserveAspectRatio="xMidYMin meet" role="img" ' +
      'aria-label="Flowchart of how a discrepancy is handled, with live counts">'];

    var yOfRow = function (r) { return 12 + r * ROW; };
    var thick = function (n) { return (1.5 + 9 * (n / Math.max(1, c.total))).toFixed(2); };

    // spine segments: what is still travelling down at each stage
    var spine = [
      [0, 1, c.total], [1, 2, c.ack], [2, 3, c.breach],
      [3, 4, c.breach], [4, 5, c.replied], [5, 6, c.action]
    ];
    spine.forEach(function (sg) {
      if (sg[2] <= 0) return;
      var y1 = yOfRow(sg[0]) + BH, y2 = yOfRow(sg[1]);
      s.push('<line x1="' + cxSpine + '" x2="' + cxSpine + '" y1="' + y1 + '" y2="' + y2 +
        '" stroke="var(--axis)" stroke-width="' + thick(sg[2]) + '" stroke-linecap="round"/>');
      s.push('<text class="pd-flow-n" x="' + (cxSpine + 10) + '" y="' + ((y1 + y2) / 2 + 4) + '">' +
        F.group(sg[2]) + '</text>');
    });

    // branches out to the right
    var branches = [
      [1, c.wait, 'var(--st-warning)'], [2, c.ok, 'var(--st-good)'],
      [4, c.open, 'var(--st-critical)'], [5, c.justified, 'var(--st-good)']
    ];
    branches.forEach(function (b) {
      if (b[1] <= 0) return;
      var y = yOfRow(b[0]) + BH / 2;
      s.push('<line x1="' + (BX + BW) + '" x2="' + RX + '" y1="' + y + '" y2="' + y +
        '" stroke="' + b[2] + '" stroke-width="' + thick(b[1]) + '" stroke-linecap="round"/>');
      s.push('<text class="pd-flow-n" x="' + (BX + BW + 12) + '" y="' + (y - 8) + '">' + F.group(b[1]) + '</text>');
    });

    function box(x, y, w, kind, title, n, amount, key) {
      var fill = 'var(--surface-2)', stroke = 'var(--border-strong)', accent = 'var(--text-primary)';
      if (kind === 'ok') { fill = 'var(--st-good-bg)'; stroke = 'var(--st-good)'; accent = 'var(--success-text)'; }
      else if (kind === 'wait') { fill = 'var(--st-warning-bg)'; stroke = 'var(--st-warning)'; }
      else if (kind === 'flag') { fill = 'var(--st-critical-bg)'; stroke = 'var(--st-critical)'; accent = 'var(--st-critical)'; }
      else if (kind === 'decision') { fill = 'none'; stroke = 'var(--axis)'; }
      var out = ['<g class="pd-flow-box' + (key ? ' pd-flow-act' : '') + '"' + (key ? ' data-fc="' + key + '"' : '') + '>'];
      out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + BH + '" rx="9" fill="' + fill +
        '" stroke="' + stroke + '" stroke-width="1.4"' + (kind === 'decision' ? ' stroke-dasharray="5 4"' : '') + '/>');
      out.push('<text class="pd-flow-t" x="' + (x + 16) + '" y="' + (y + 24) + '">' + esc(title) + '</text>');
      if (n != null) {
        out.push('<text class="pd-flow-v" x="' + (x + 16) + '" y="' + (y + 46) + '" fill="' + accent + '">' +
          F.group(n) + '</text>');
        out.push('<text class="pd-flow-a" x="' + (x + 16 + String(F.group(n)).length * 10 + 12) + '" y="' + (y + 46) + '">' +
          esc(cr(amount)) + '</text>');
      }
      out.push('</g>');
      return out.join('');
    }

    s.push(box(BX, yOfRow(0), BW, 'node', 'Transfer released', c.total, c.amt.total, null));
    s.push(box(BX, yOfRow(1), BW, 'decision', 'Did the receiver acknowledge it?', null, null, null));
    s.push(box(BX, yOfRow(2), BW, 'decision', 'Within the ' + S.tol.toFixed(1) + '% permitted margin?', null, null, null));
    s.push(box(BX, yOfRow(3), BW, 'flag', 'Show-cause notice issued', c.breach, c.amt.breach, 'all'));
    s.push(box(BX, yOfRow(4), BW, 'decision', 'Did the department reply?', null, null, null));
    s.push(box(BX, yOfRow(5), BW, 'decision', 'Was the explanation accepted?', null, null, null));
    s.push(box(BX, yOfRow(6), BW, 'flag', 'Legal action', c.action, c.amt.action, 'action'));

    s.push(box(RX, yOfRow(1), RW, 'wait', '◷ Awaiting acknowledgement', c.wait, c.amt.wait, 'wait'));
    s.push(box(RX, yOfRow(2), RW, 'ok', '✓ Verified — path shown green', c.ok, c.amt.ok, 'ok'));
    s.push(box(RX, yOfRow(4), RW, 'flag', '! Notice open — path stays red', c.open, c.amt.open, 'open'));
    s.push(box(RX, yOfRow(5), RW, 'ok', '✓ Justified — path restored green', c.justified, c.amt.justified, 'justified'));

    // yes/no labels on the decisions
    [[1, 'no'], [2, 'yes'], [4, 'no'], [5, 'yes']].forEach(function (p) {
      s.push('<text class="pd-flow-yn" x="' + (BX + BW + 12) + '" y="' + (yOfRow(p[0]) + BH / 2 + 16) + '">' + p[1] + '</text>');
    });
    // the down-branch label sits left of the spine so it never collides with
    // the flow count, which rides the right
    [[1, 'yes'], [2, 'no'], [4, 'yes'], [5, 'no']].forEach(function (p) {
      s.push('<text class="pd-flow-yn" x="' + (cxSpine - 10) + '" y="' + (yOfRow(p[0]) + BH + 15) +
        '" text-anchor="end">' + p[1] + '</text>');
    });

    s.push('</svg>');
    host.innerHTML = s.join('') +
      (c.agg ? '<p class="card-sub" style="margin:12px 0 0;text-align:center">Of these, <b>' +
        F.group(c.agg) + '</b> are aggregate transfers standing in for the districts and blocks this demo ' +
        'does not trace individually — they reconcile by construction, so the verified share is flattering ' +
        'by about that much.</p>' : '');

    host.querySelectorAll('[data-fc]').forEach(function (g) {
      g.addEventListener('click', function () {
        var k = g.dataset.fc;
        if (k === 'wait' || k === 'ok') {          // these live in the ledger, not the register
          S.ledgerFilter = k; S.ledgerN = 40;
          location.hash = 'ledger';
        } else {
          S.flagFilter = k;
          renderFlags();
          var el = document.getElementById('flagList');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    document.getElementById('tblFlowchart').innerHTML = table(
      [{ t: 'Outcome' }, { t: 'Transfers', num: true }, { t: 'Value', num: true }, { t: 'Share', num: true }],
      [['Verified — within margin', c.ok, c.amt.ok],
       ['Awaiting acknowledgement', c.wait, c.amt.wait],
       ['Breached the margin', c.breach, c.amt.breach],
       ['— notice open', c.open, c.amt.open],
       ['— justified and closed', c.justified, c.amt.justified],
       ['— legal action', c.action, c.amt.action],
       ['All transfers', c.total, c.amt.total]
      ].map(function (r) {
        return '<tr><td>' + esc(r[0]) + '</td><td class="num">' + F.group(r[1]) +
          '</td><td class="num">' + cr(r[2]) + '</td><td class="num">' +
          F.pct((100 * r[1]) / Math.max(1, c.total)) + '</td></tr>';
      })
    );
  }

  /* ================= RED FLAGS ================= */
  function renderFlags() {
    renderFlowchart();
    var flagged = scopedTxns().map(function (t) { return { t: t, st: statusOf(t) }; })
      .filter(function (x) { return x.st.stage === 'open' || x.st.stage === 'action' || x.st.stage === 'justified'; });

    var open = flagged.filter(function (x) { return x.st.stage === 'open'; });
    var action = flagged.filter(function (x) { return x.st.stage === 'action'; });
    var just = flagged.filter(function (x) { return x.st.stage === 'justified'; });
    var atRisk = open.concat(action).reduce(function (a, x) {
      return a + Math.abs(x.t.amount - x.t.ackAmount);
    }, 0);

    var k = [
      { l: 'Notices open', v: F.group(open.length), d: 'Reply awaited from the department' },
      { l: 'Under legal action', v: F.group(action.length), d: 'Explanation not accepted' },
      { l: 'Justified &amp; closed', v: F.group(just.length), d: 'Line restored to green' },
      { l: 'Value in dispute', v: cr(atRisk), d: 'Unexplained gap, open cases' }
    ];
    document.getElementById('flagKpis').innerHTML = k.map(function (x) {
      return '<div class="card"><div class="tile-label">' + x.l + '</div><div class="tile-value">' + x.v +
        '</div><div class="tile-foot"><span class="tile-delta">' + esc(x.d) + '</span></div></div>';
    }).join('');

    var f = document.getElementById('flagFilters');
    if (!f.dataset.built) {
      f.innerHTML = [['all', 'All cases'], ['open', 'Open'], ['action', 'Legal action'], ['justified', 'Justified']]
        .map(function (p) { return '<button class="mini-btn" data-ff="' + p[0] + '">' + p[1] + '</button>'; }).join('');
      f.dataset.built = '1';
      f.querySelectorAll('[data-ff]').forEach(function (b) {
        b.addEventListener('click', function () { S.flagFilter = b.dataset.ff; renderFlags(); });
      });
    }
    f.querySelectorAll('[data-ff]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.ff === S.flagFilter));
    });

    var list = flagged.filter(function (x) {
      if (S.flagFilter !== 'all' && x.st.stage !== S.flagFilter) return false;
      return matches(x.t.id + ' ' + nodes[x.t.to].name + ' ' + x.t.caseNarrative.noticeNo);
    }).sort(function (a, b) {
      return Math.abs(b.t.amount - b.t.ackAmount) - Math.abs(a.t.amount - a.t.ackAmount);
    });

    document.getElementById('flagList').innerHTML = list.length ? list.map(function (x) {
      var t = x.t, c = t.caseNarrative, d = txnDev(t), gap = Math.abs(t.amount - t.ackAmount);
      var to = nodes[t.to];
      return '<div class="case ' + (x.st.stage === 'justified' ? 'resolved' : '') + '" style="margin-bottom:18px">' +
        '<div class="case-h"><span class="case-title">' + esc(to.name) + '</span>' + pill(x.st) +
        '<span class="chip">' + esc(t.id) + '</span></div>' +
        '<div class="case-meta">' +
        '<span>Released <b style="color:var(--text-primary)">' + cr(t.amount) + '</b></span>' +
        '<span>Acknowledged <b style="color:var(--text-primary)">' + cr(t.ackAmount) + '</b></span>' +
        '<span>Gap <b style="color:var(--st-critical)">' + cr(gap) + ' (' + d.toFixed(2) + '%)</b></span>' +
        '<span>Sender: ' + esc(nodes[t.from].short) + '</span>' +
        '</div>' +
        '<div class="notice"><b>Show-cause notice ' + esc(c.noticeNo) + ' · issued ' + esc(c.noticeOn) +
        (c.repliedOn ? ' · reply received ' + esc(c.repliedOn) : ' · no reply on record') + '</b>' +
        esc(c.explanation) +
        (x.st.stage === 'action' ? '<div style="margin-top:8px;color:var(--st-critical)"><b style="color:var(--st-critical)">Action taken</b>' + esc(c.action) + '</div>' : '') +
        (x.st.stage === 'justified' ? '<div style="margin-top:8px;color:var(--success-text)">Explanation accepted by the competent authority. Deviation regularised; the path is shown green.</div>' : '') +
        (x.st.stage === 'open' ? '<div style="margin-top:8px">Reply due within 15 days of issue. The path stays red until the case is closed.</div>' : '') +
        '</div></div>';
    }).join('') : '<div class="empty">No cases match the current filters. Lower the permitted deviation to see how the threshold changes what surfaces.</div>';
  }

  /* ================= EXPENDITURE ================= */
  function renderSpend() {
    var all = scopedSpends();
    var billed = all.reduce(function (a, s) { return a + s.amount; }, 0);
    var acked = all.filter(function (s) { return s.vendorAck != null; });
    var clean = all.filter(function (s) { return spendStatus(s).key === 'ok'; });
    var geo = all.filter(function (s) { return s.geoProof; });
    var verif = all.reduce(function (a, s) { return a + s.citizenVerifications; }, 0);

    document.getElementById('spendKpis').innerHTML = [
      { l: 'Billed to the public purse', v: cr(billed), d: F.group(all.length) + ' bills across traced works' },
      { l: 'Vendor-acknowledged', v: F.pct(100 * acked.length / all.length), d: 'Receiving party countersigned' },
      { l: 'Reconciled within margin', v: F.pct(100 * clean.length / all.length), d: 'At ' + S.tol.toFixed(1) + '% permitted deviation' },
      { l: 'Citizen verifications', v: F.group(verif), d: F.pct(100 * geo.length / all.length) + ' of bills carry geo-tagged proof' }
    ].map(function (x) {
      return '<div class="card"><div class="tile-label">' + x.l + '</div><div class="tile-value">' + x.v +
        '</div><div class="tile-foot"><span class="tile-delta">' + esc(x.d) + '</span></div></div>';
    }).join('');

    var f = document.getElementById('spendFilters');
    if (!f.dataset.built) {
      f.innerHTML = [['all', 'All bills'], ['ok', '✓ Reconciled'], ['wait', '◷ Ack pending'], ['flag', '! Mismatch']]
        .map(function (p) { return '<button class="mini-btn" data-sf="' + p[0] + '">' + p[1] + '</button>'; }).join('');
      f.dataset.built = '1';
      f.querySelectorAll('[data-sf]').forEach(function (b) {
        b.addEventListener('click', function () { S.spendFilter = b.dataset.sf; S.spendN = 40; renderSpend(); });
      });
    }
    f.querySelectorAll('[data-sf]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.sf === S.spendFilter));
    });

    var list = all.filter(function (s) {
      if (S.spendFilter !== 'all' && spendStatus(s).key !== S.spendFilter) return false;
      return matches(s.id + ' ' + s.vendor + ' ' + s.projectName + ' ' + s.district + ' ' + s.category + ' ' + s.item);
    }).sort(function (a, b) { return b.amount - a.amount; });

    document.getElementById('spendCount').textContent =
      F.group(list.length) + ' bills · ' + cr(list.reduce(function (a, s) { return a + s.amount; }, 0)) + ' billed';

    document.getElementById('spendTbl').innerHTML =
      '<thead><tr><th>Bill</th><th>Work</th><th>Sector</th><th>Vendor</th>' +
      '<th class="num">Amount</th><th class="num">Vendor ack</th><th class="num">Deviation</th><th>Status</th></tr></thead><tbody>' +
      list.slice(0, S.spendN).map(function (s) {
        var st = spendStatus(s), d = dev(s.amount, s.vendorAck);
        return '<tr><td><span class="mono">' + esc(s.id) + '</span><br><span class="sub">' + esc(s.billedOn) +
          (s.geoProof ? ' · 📍 proof' : '') + '</span></td>' +
          '<td>' + esc(s.projectName) + '<br><span class="sub">' + esc(s.district) + ', ' + esc(s.state) + ' · ' + esc(s.item) + '</span></td>' +
          '<td><span class="chip">' + esc(s.category) + '</span></td>' +
          '<td>' + esc(s.vendor) + '</td>' +
          '<td class="num">' + cr(s.amount) + '</td>' +
          '<td class="num">' + (s.vendorAck == null ? '<span class="sub">pending</span>' : cr(s.vendorAck)) + '</td>' +
          '<td class="num">' + devText(d) + '</td>' +
          '<td>' + pill(st) + '</td></tr>';
      }).join('') + '</tbody>';
    var more = document.getElementById('spendMore');
    more.style.display = list.length > S.spendN ? '' : 'none';
    more.textContent = 'Show more (' + F.group(list.length - S.spendN) + ' remaining)';
    more.onclick = function () { S.spendN += 60; renderSpend(); };
  }

  /* ================= REPRESENTATIVES ================= */
  function myRatings() {
    try { return JSON.parse(localStorage.getItem('pd-ratings') || '{}'); } catch (e) { return {}; }
  }
  function setRating(id, v) {
    var m = myRatings(); m[id] = v;
    try { localStorage.setItem('pd-ratings', JSON.stringify(m)); } catch (e) {}
  }

  function repMetrics(r) {
    var node = r.house.indexOf('MP') !== -1
      ? byDistrict[r.state + '|' + r.constituency]
      : byTaluka[r.state + '|' + r.district + '|' + r.constituency];
    if (!node) return null;
    var projects = projectsOf[node.id] || [];
    var routed = node.received;
    var spent = projects.reduce(function (a, p) { return a + (p.spent || 0); }, 0);
    var allocatedToProjects = projects.reduce(function (a, p) { return a + p.received; }, 0);
    var util = allocatedToProjects ? 100 * spent / allocatedToProjects : 0;
    var progress = projects.length
      ? projects.reduce(function (a, p) { return a + p.physicalProgress; }, 0) / projects.length : 0;
    var sub = descendants(node.id);
    var flags = 0, tot = 0;
    sub.forEach(function (c) {
      var t = D.txnByTo[c.id]; if (!t) return;
      tot++; if (statusOf(t).key === 'flag') flags++;
    });
    var flagPct = tot ? 100 * flags / tot : 0;
    var score = 0.40 * Math.min(util, 100) + 0.35 * progress + 0.25 * Math.max(0, 100 - flagPct * 6);
    return {
      node: node, routed: routed, util: util, progress: progress,
      flags: flags, flagPct: flagPct, projects: projects.length, score: score
    };
  }

  function renderReps() {
    var f = document.getElementById('repFilters');
    if (!f.dataset.built) {
      f.innerHTML =
        [['', 'Both houses'], ['MP', 'Lok Sabha'], ['MLA', 'Vidhan Sabha']]
          .map(function (p) { return '<button class="mini-btn" data-rh="' + p[0] + '">' + p[1] + '</button>'; }).join('') +
        '<span style="width:10px"></span>' +
        [['score', 'By score'], ['rating', 'By citizen rating'], ['flags', 'By flags']]
          .map(function (p) { return '<button class="mini-btn" data-rs="' + p[0] + '">' + p[1] + '</button>'; }).join('');
      f.dataset.built = '1';
      f.querySelectorAll('[data-rh]').forEach(function (b) {
        b.addEventListener('click', function () { S.repHouse = b.dataset.rh; renderReps(); });
      });
      f.querySelectorAll('[data-rs]').forEach(function (b) {
        b.addEventListener('click', function () { S.repSort = b.dataset.rs; renderReps(); });
      });
    }
    f.querySelectorAll('[data-rh]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.rh === S.repHouse)); });
    f.querySelectorAll('[data-rs]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.rs === S.repSort)); });

    var mine = myRatings();
    var rows = D.reps.filter(function (r) {
      if (S.state && r.state !== S.state) return false;
      if (S.repHouse && r.house.indexOf(S.repHouse) === -1) return false;
      return matches(r.name + ' ' + r.constituency + ' ' + r.state + ' ' + r.party);
    }).map(function (r) {
      var m = repMetrics(r);
      if (!m) return null;
      // Citizen sentiment tracks delivery, but only loosely — the residual spread
      // is the point: popularity and performance are related, not the same thing.
      var base = Math.max(1, Math.min(5, 0.55 * (1 + 4 * (m.score / 100)) + 0.45 * r.seedRating));
      var votes = r.seedVotes + (mine[r.id] ? 1 : 0);
      var agg = (base * r.seedVotes + (mine[r.id] || 0)) / votes;
      return { r: r, m: m, agg: agg, votes: votes, mine: mine[r.id] || 0 };
    }).filter(Boolean);

    rows.sort(function (a, b) {
      if (S.repSort === 'rating') return b.agg - a.agg;
      if (S.repSort === 'flags') return b.m.flagPct - a.m.flagPct;
      return b.m.score - a.m.score;
    });

    document.getElementById('repTbl').innerHTML =
      '<thead><tr><th>Representative</th><th>House / constituency</th>' +
      '<th class="num">Funds routed</th><th>Utilisation</th><th class="num">Avg. progress</th>' +
      '<th class="num">Flags</th><th class="num">Score</th><th>Citizen rating</th></tr></thead><tbody>' +
      rows.map(function (x) {
        var r = x.r, m = x.m;
        var sev = m.flagPct > 12 ? 'flag' : m.flagPct > 5 ? 'wait' : null;
        var stars = '<span class="stars" role="group" aria-label="Rate ' + esc(r.name) + '">' +
          [1, 2, 3, 4, 5].map(function (i) {
            return '<button class="star' + (i <= (x.mine || Math.round(x.agg)) ? ' on' : '') +
              '" data-rate="' + esc(r.id) + '" data-v="' + i + '" title="Rate ' + i + ' of 5" aria-label="' + i + ' of 5">★</button>';
          }).join('') + '</span>';
        return '<tr><td><b>' + esc(r.name) + '</b><br><span class="sub">' + esc(r.party) + ' · ' + r.termYears + 'y in office</span></td>' +
          '<td>' + esc(r.house) + '<br><span class="sub">' + esc(r.constituency) + ', ' + esc(r.state) + '</span></td>' +
          '<td class="num">' + cr(m.routed) + '<br><span class="sub">' + m.projects + ' works</span></td>' +
          '<td>' + C.meter(m.util, null) + '<br><span class="sub">' + F.pct(m.util, 0) + ' of released funds billed</span></td>' +
          '<td class="num">' + F.pct(m.progress, 0) + '</td>' +
          '<td class="num">' + (m.flags ? '<span class="pill ' + (sev || 'mute') + '"><i>' + (sev === 'flag' ? '!' : '◷') + '</i>' + m.flags + '</span>' : '<span class="sub">0</span>') + '</td>' +
          '<td class="num"><span class="rating-num">' + m.score.toFixed(0) + '</span><span class="sub">/100</span></td>' +
          '<td>' + stars + '<br><span class="sub"><span class="rating-num">' + x.agg.toFixed(1) + '</span> · ' + F.group(x.votes) + ' ratings' +
          (x.mine ? ' · you rated ' + x.mine : '') + '</span></td></tr>';
      }).join('') + '</tbody>';

    document.querySelectorAll('[data-rate]').forEach(function (b) {
      b.addEventListener('click', function () {
        setRating(b.dataset.rate, +b.dataset.v);
        renderReps();
      });
    });
  }

  /* ================= MY TAXES ================= */
  function renderTax() {
    var ch = document.getElementById('taxChooser');
    ch.innerHTML = D.TAXPAYERS.map(function (t, i) {
      return '<button data-tp="' + i + '" aria-pressed="' + (i === S.taxpayer) + '">' +
        '<b>' + esc(t.name) + '</b><br><span class="pan">PAN ' + esc(t.pan) + '</span></button>';
    }).join('');
    ch.querySelectorAll('[data-tp]').forEach(function (b) {
      b.addEventListener('click', function () { S.taxpayer = +b.dataset.tp; renderTax(); });
    });

    var tp = D.TAXPAYERS[S.taxpayer];
    document.getElementById('taxWho').textContent =
      tp.name + ' · PAN ' + tp.pan + ' · assessed in ' + tp.district + ', ' + tp.state;

    var cum = [], run = 0;
    tp.monthly.forEach(function (v) { run += v; cum.push(run); });
    var shareOfNational = tp.taxPaidFY / (D.TREASURY.collectedYTD * 1e7);

    document.getElementById('taxKpis').innerHTML = [
      { l: 'Tax paid, FY ' + D.META.fy, v: F.rupees(tp.taxPaidFY) },
      { l: 'Effective rate on gross', v: F.pct(100 * tp.taxPaidFY / tp.grossIncome) },
      { l: 'Your share of the pool', v: (shareOfNational * 1e9).toFixed(2) + ' per billion' }
    ].map(function (x) {
      return '<div><div class="tile-label">' + esc(x.l) + '</div><div class="tile-value" style="font-size:20px">' + esc(x.v) + '</div></div>';
    }).join('');

    C.areaChart(document.getElementById('chTax'), {
      labels: D.MONTHS, height: 200, aria: 'Your cumulative tax paid by month',
      yFmt: function (v) { return '₹' + F.group(Math.round(v / 1000)) + 'k'; },
      series: [{ name: 'Cumulative tax paid', values: cum, role: 'primary' }]
    });

    // apportion this taxpayer's payment across sectors at the observed national ratio
    var byCat = {}, tot = 0;
    D.spends.forEach(function (s) { byCat[s.category] = (byCat[s.category] || 0) + s.amount; tot += s.amount; });
    var rows = Object.keys(byCat).map(function (k) {
      return { label: k, value: (byCat[k] / tot) * tp.taxPaidFY };
    }).sort(function (a, b) { return b.value - a.value; });
    C.barsH(document.getElementById('chMyCat'), {
      rows: rows, labelW: 190, rowH: 30, aria: 'Your tax apportioned by sector',
      valueName: 'Your share', vFmt: function (v) { return F.rupees(v); }
    });

    // last-mile trace in the taxpayer's own district
    var dn = byDistrict[tp.state + '|' + tp.district];
    var projects = dn ? (projectsOf[dn.id] || []) : [];
    document.getElementById('traceSub').innerHTML =
      'Works in ' + esc(tp.district) + ' funded from the pool you paid into. Your own share of each is tiny by design — ' +
      'which is exactly why the <b>chain</b>, and not the individual, has to be auditable.';
    document.getElementById('traceList').innerHTML = projects.slice(0, 10).map(function (p) {
      var t = D.txnByTo[p.id], st = statusOf(t);
      var yours = (p.spent || 0) * 1e7 * shareOfNational;
      return '<div class="trace-item">' +
        '<span>' + esc(p.name) + '<br><span class="sub">' + esc(p.taluka) + ' · ' + esc(p.category) +
        ' · ' + p.physicalProgress + '% complete · ' + cr(p.spent || 0) + ' spent</span></span>' +
        pill(st) +
        '<span class="amt">' + (yours < 1 ? (yours * 100).toFixed(0) + ' paise' : F.rupees(yours)) +
        '<br><span class="sub" style="font-weight:400">your share</span></span></div>';
    }).join('') || '<div class="empty">No traced works in this district.</div>';
  }

  /* ================= CHAIN MAP =================
     The whole hierarchy as one picture. An icicle (partition) chart: each band
     is a tier, and every cell sits directly beneath its parent — so a broken
     link can be read straight up its own column to the Union band. Red threads
     are drawn from the very top of the chart down to each broken link, which is
     the question this view exists to answer: which path, top to bottom, is red.
     ============================================================ */
  var CODE_OF = {};
  D.GEO.forEach(function (g) { CODE_OF[g.state] = g.code; });
  var TIER_ORDER = ['union', 'state', 'district', 'taluka', 'project'];
  var TIER_NAMES = ['Union', 'State', 'District', 'Block', 'Work'];
  var DEPTH_LABEL = ['States', 'Districts', 'Blocks', 'Works'];

  // Children's widths divide the parent's. With the untraced remainder hidden
  // they are normalised to fill it (readable); with it shown the divisor is the
  // parent's own receipt, so money retained at that tier shows as a gap.
  function layoutIcicle(rootId, maxDepth, showAgg, W) {
    var cells = [];
    (function place(id, x, w, depth) {
      cells.push({ id: id, x: x, w: w, d: depth });
      if (depth >= maxDepth) return;
      var kids = (nodes[id].children || []).filter(function (c) {
        if (!showAgg && nodes[c].aggregate) return false;
        var t = D.txnByTo[c];
        return !t || released(t);        // nothing appears before it was sent
      });
      if (!kids.length) return;
      var denom = showAgg ? nodes[id].received
        : kids.reduce(function (a, c) { return a + nodes[c].received; }, 0);
      if (!denom) return;
      var cx = x;
      kids.forEach(function (c) {
        var cw = (w * nodes[c].received) / denom;
        place(c, cx, cw, depth + 1);
        cx += cw;
      });
    })(rootId, 0, W, 0);
    return cells;
  }

  function renderMap() {
    var host = document.getElementById('chMap');
    if (!host) return;

    /* ---- controls ---- */
    var tools = document.getElementById('mapTools');
    if (!tools.dataset.built) {
      tools.innerHTML =
        DEPTH_LABEL.map(function (l, i) {
          return '<button class="mini-btn" data-md="' + (i + 1) + '">' + l + '</button>';
        }).join('') +
        '<span style="width:10px"></span>' +
        '<button class="mini-btn" data-mb="1">Only broken chains</button>' +
        '<button class="mini-btn" data-ma="1">Show untraced remainder</button>';
      tools.dataset.built = '1';
      tools.querySelectorAll('[data-md]').forEach(function (b) {
        b.addEventListener('click', function () { S.mapDepth = +b.dataset.md; renderMap(); });
      });
      tools.querySelector('[data-mb]').addEventListener('click', function () {
        S.mapBroken = !S.mapBroken; renderMap();
      });
      tools.querySelector('[data-ma]').addEventListener('click', function () {
        S.mapAgg = !S.mapAgg; renderMap();
      });
    }
    tools.querySelectorAll('[data-md]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(+b.dataset.md === S.mapDepth));
    });
    tools.querySelector('[data-mb]').setAttribute('aria-pressed', String(S.mapBroken));
    tools.querySelector('[data-ma]').setAttribute('aria-pressed', String(S.mapAgg));

    /* ---- month scrubber: rewind the chain to a point in the year ---- */
    var mb = document.getElementById('mapMonths');
    if (!mb.dataset.built) {
      mb.innerHTML = '<span class="f-label">As on end of</span>' +
        MON.map(function (m, i) { return '<button class="mini-btn" data-mm="' + i + '">' + m + '</button>'; }).join('') +
        '<button class="mini-btn" data-mm="">Today</button>';
      mb.dataset.built = '1';
      mb.querySelectorAll('[data-mm]').forEach(function (b) {
        b.addEventListener('click', function () {
          S.mapMonth = b.dataset.mm === '' ? null : +b.dataset.mm;
          renderMap();
        });
      });
    }
    mb.querySelectorAll('[data-mm]').forEach(function (b) {
      var v = b.dataset.mm === '' ? null : +b.dataset.mm;
      b.setAttribute('aria-pressed', String(v === S.mapMonth));
    });

    /* ---- geometry ---- */
    var W = Math.max(520, host.clientWidth || 1100);
    var GUT = 84, iw = W - GUT - 10;
    var BAND = 54, GAPY = 26, TOP = 16;

    var rootId = (S.state && CODE_OF[S.state]) ? 'IN/' + CODE_OF[S.state] : 'IN';
    if (!nodes[rootId]) rootId = 'IN';
    var baseIdx = TIER_ORDER.indexOf(nodes[rootId].tier);
    var maxDepth = Math.min(S.mapDepth, TIER_ORDER.length - 1 - baseIdx);

    var cells = layoutIcicle(rootId, maxDepth, S.mapAgg, iw);
    var maxD = 0, perTier = [];
    cells.forEach(function (c) {
      if (c.d > maxD) maxD = c.d;
      perTier[c.d] = (perTier[c.d] || 0) + 1;
    });
    var H = TOP + (maxD + 1) * BAND + maxD * GAPY + 14;
    var yOf = function (d) { return TOP + d * (BAND + GAPY); };

    /* ---- which cells sit on a broken chain ---- */
    var onBroken = {}, broken = [];
    cells.forEach(function (c) {
      var t = D.txnByTo[c.id];
      if (!t) return;
      var st = statusAsOf(t);
      if (!st || st.key !== 'flag') return;
      broken.push({ cell: c, t: t, st: st });
      pathTo(c.id).forEach(function (a) { onBroken[a] = true; });
    });

    /* ---- draw ---- */
    var svg = ['<svg class="pd-svg pd-map" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H +
      '" role="img" aria-label="Chain map: every traced transfer, coloured by whether both parties agree">'];
    svg.push('<defs><pattern id="hatchFlag" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="7" height="7" fill="var(--st-critical)"/>' +
      '<line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,.42)" stroke-width="2.4"/></pattern></defs>');

    // tier gutter
    for (var d = 0; d <= maxD; d++) {
      var ty = yOf(d);
      svg.push('<text class="pd-tier" x="' + (GUT - 14) + '" y="' + (ty + BAND / 2 - 1) + '" text-anchor="end">' +
        esc(TIER_NAMES[baseIdx + d]) + '</text>');
      svg.push('<text class="pd-tier-n" x="' + (GUT - 14) + '" y="' + (ty + BAND / 2 + 13) + '" text-anchor="end">' +
        perTier[d] + '</text>');
      svg.push('<line x1="' + GUT + '" x2="' + (W - 10) + '" y1="' + (ty + BAND + GAPY / 2) + '" y2="' +
        (ty + BAND + GAPY / 2) + '" stroke="var(--grid)" stroke-width="1" opacity="' + (d < maxD ? 1 : 0) + '"/>');
    }

    var drawn = 0, tooSmall = 0;
    cells.forEach(function (c) {
      var n = nodes[c.id], t = D.txnByTo[c.id];
      var st = t ? statusAsOf(t) : { key: 'root', label: 'Source of funds', icon: '●' };
      var x = GUT + c.x, y = yOf(c.d), w = Math.max(0, c.w - 1);
      // sub-pixel slivers are counted, not drawn — the footer says how many
      if (w < 0.4) { if (c.d > 0) tooSmall++; return; }
      if (c.d > 0) drawn++;
      var fill, fo = 1;
      if (st.key === 'ok') { fill = 'var(--st-good)'; fo = 0.30; }        // the calm majority
      else if (st.key === 'wait') { fill = 'var(--st-warning)'; fo = 0.85; }
      else if (st.key === 'flag') { fill = 'url(#hatchFlag)'; }
      else { fill = 'var(--series-1)'; fo = 0.22; }
      var dim = (S.mapBroken && !onBroken[c.id]) ? ' pd-dim' : '';
      svg.push('<rect class="pd-cell' + dim + (n.aggregate ? ' pd-agg' : '') + '" data-id="' + esc(c.id) +
        '" x="' + (x + 0.5).toFixed(1) + '" y="' + y + '" width="' + w.toFixed(1) + '" height="' + BAND +
        '" rx="3" fill="' + fill + '" fill-opacity="' + fo + '"/>');

      // label only where it genuinely fits
      var lbl = n.short || n.name;
      if (w > lbl.length * 6.4 + 16) {
        svg.push('<text class="pd-cell-t" x="' + (x + w / 2) + '" y="' + (y + BAND / 2 + 4) +
          '" text-anchor="middle" fill="' + (st.key === 'flag' ? '#fff' : 'var(--text-primary)') + '">' +
          esc(lbl) + '</text>');
      }
    });

    // red threads: top of the chart straight down to each broken link
    broken.forEach(function (b) {
      var cx = (GUT + b.cell.x + b.cell.w / 2).toFixed(1), ey = yOf(b.cell.d) + BAND;
      svg.push('<line x1="' + cx + '" x2="' + cx + '" y1="0" y2="' + ey +
        '" stroke="var(--surface-1)" stroke-width="4.5" opacity=".85"/>');
      svg.push('<line class="pd-thread" x1="' + cx + '" x2="' + cx + '" y1="0" y2="' + ey +
        '" stroke="var(--st-critical)" stroke-width="1.8" stroke-linecap="round"/>');
      svg.push('<circle cx="' + cx + '" cy="' + ey + '" r="3.4" fill="var(--st-critical)" ' +
        'stroke="var(--surface-1)" stroke-width="1.5"/>');
    });

    svg.push('</svg>');
    host.innerHTML = svg.join('');

    /* ---- interaction: hover lights the whole column, click drills ---- */
    var rects = host.querySelectorAll('.pd-cell');
    rects.forEach(function (r) {
      r.addEventListener('mousemove', function (e) {
        var id = r.dataset.id, n = nodes[id], t = D.txnByTo[id];
        var chain = pathTo(id).map(function (a) { return nodes[a].short; }).join(' → ');
        var st = t ? statusAsOf(t) : null;
        var body = '<div class="pd-tip-h">' + esc(n.short) + '</div>' +
          '<div class="pd-tip-row">Received<b>' + cr(n.received) + '</b></div>' +
          (st ? '<div class="pd-tip-row">Status<b>' + st.icon + ' ' + esc(st.label) + '</b></div>' +
                '<div class="pd-tip-row">Deviation<b>' + (t.pending ? 'pending' : txnDev(t).toFixed(2) + '%') + '</b></div>'
              : '<div class="pd-tip-row">Source of every rupee below</div>') +
          '<div class="pd-tip-meta">' + esc(chain) + '</div>';
        C.showTip(body, e.clientX, e.clientY);
      });
      r.addEventListener('mouseenter', function () {
        var hot = {};
        pathTo(r.dataset.id).forEach(function (a) { hot[a] = true; });
        rects.forEach(function (o) { o.classList.toggle('pd-hot', !!hot[o.dataset.id]); });
        host.querySelector('svg').classList.add('pd-focus');
      });
      r.addEventListener('mouseleave', function () {
        rects.forEach(function (o) { o.classList.remove('pd-hot'); });
        host.querySelector('svg').classList.remove('pd-focus');
        C.hideTip();
      });
      r.addEventListener('click', function () {
        goNode(r.dataset.id);
        location.hash = 'flow:' + encodeURIComponent(r.dataset.id);
      });
    });

    /* ---- the same answer in words ---- */
    document.getElementById('mapFoot').innerHTML =
      (S.mapMonth == null ? '' : '<b>As on 28 ' + MON[S.mapMonth] + ' 2026</b> · ') +
      '<b>' + F.group(drawn) + '</b> transfers drawn · <b style="color:var(--st-critical)">' +
      broken.length + '</b> broken ' + (broken.length === 1 ? 'chain' : 'chains') +
      ' at a ' + S.tol.toFixed(1) + '% permitted deviation' +
      (tooSmall ? ' · ' + F.group(tooSmall) + ' too thin to draw at this width' : '') +
      (S.mapAgg ? ' · gaps are money retained at that tier' : ' · untraced remainder hidden');

    broken.sort(function (a, b) {
      return Math.abs(b.t.amount - b.t.ackAmount) - Math.abs(a.t.amount - a.t.ackAmount);
    });
    // At a tight tolerance this list runs to dozens — cap it and send the
    // reader to the full register rather than printing a wall of rows.
    var BROKEN_CAP = 25;
    document.getElementById('brokenList').innerHTML = broken.length ? broken.slice(0, BROKEN_CAP).map(function (b) {
      var p = pathTo(b.cell.id), gap = Math.abs(b.t.amount - b.t.ackAmount);
      var trail = p.map(function (a, i) {
        var last = i === p.length - 1;
        return '<span class="' + (last ? 'br-bad' : 'br-ok') + '">' + esc(nodes[a].short) + '</span>';
      }).join('<span class="br-arrow">→</span>');
      return '<button class="br-row" data-go="' + esc(b.cell.id) + '">' +
        '<span class="br-trail">' + trail + '</span>' +
        '<span class="br-meta">' + pill(b.st) + '<b>' + cr(gap) + '</b>' +
        '<span class="sub">' + txnDev(b.t).toFixed(2) + '%</span></span></button>';
    }).join('') + (broken.length > BROKEN_CAP
      ? '<div class="empty">…and ' + F.group(broken.length - BROKEN_CAP) +
        ' more at this tolerance. The full register, with notices and outcomes, is under <b>Red flags</b>.</div>'
      : '')
      : '<div class="empty">No broken chains at this tolerance. Lower the permitted deviation to see the threshold bite.</div>';

    document.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () {
        goNode(b.dataset.go);
        location.hash = 'flow:' + encodeURIComponent(b.dataset.go);
      });
    });

    renderCartogram();
  }

  /* ---- tile cartogram ----
     Deliberately a tile grid, not a boundary map: India's borders are
     contested in places, and a wrong outline on screen would hand a critic an
     easy way to dismiss the whole argument. Tiles make no territorial claim
     and still read as the country at a glance. */
  var TILE_POS = {
    'Rajasthan': [1, 0], 'Uttar Pradesh': [2, 0], 'Bihar': [3, 0],
    'Gujarat': [0, 1], 'West Bengal': [4, 1],
    'Maharashtra': [1, 2], 'Karnataka': [1, 3], 'Tamil Nadu': [2, 4]
  };
  var ABBR = {
    'Rajasthan': 'RJ', 'Uttar Pradesh': 'UP', 'Bihar': 'BR', 'Gujarat': 'GJ',
    'West Bengal': 'WB', 'Maharashtra': 'MH', 'Karnataka': 'KA', 'Tamil Nadu': 'TN'
  };

  function renderCartogram() {
    var host = document.getElementById('cartogram');
    if (!host) return;

    var stats = {};
    D.GEO.forEach(function (g) { stats[g.state] = { ok: 0, wait: 0, flag: 0, broken: 0 }; });
    D.txns.forEach(function (t) {
      var sn = stateOfTxn(t);
      if (!stats[sn]) return;
      var st = statusAsOf(t);
      if (!st) return;
      stats[sn][st.key] += t.amount;
      if (st.key === 'flag') stats[sn].broken++;
    });

    var grid = [];
    for (var i = 0; i < 25; i++) grid.push(null);
    Object.keys(TILE_POS).forEach(function (s) {
      var p = TILE_POS[s];
      grid[p[1] * 5 + p[0]] = s;
    });

    host.innerHTML = '<div class="cart-grid">' + grid.map(function (s) {
      if (!s) return '<span class="cart-empty" aria-hidden="true"></span>';
      var st = stats[s], tot = st.ok + st.wait + st.flag;
      if (!tot) {
        return '<button class="cart-tile cart-none" data-cs="' + esc(s) + '">' +
          '<span class="ct-ab">' + esc(ABBR[s]) + '</span><span class="ct-pc">—</span>' +
          '<span class="ct-br">no data yet</span></button>';
      }
      var clean = (100 * st.ok) / tot;
      var sev = clean >= 98 ? 'ok' : clean >= 90 ? 'wait' : 'flag';
      return '<button class="cart-tile cart-' + sev + '" data-cs="' + esc(s) + '"' +
        (S.state === s ? ' aria-pressed="true"' : '') +
        ' title="' + esc(s) + ' — ' + F.pct(clean) + ' of money moved is verified">' +
        '<span class="ct-ab">' + esc(ABBR[s]) + '</span>' +
        '<span class="ct-pc">' + clean.toFixed(1) + '%</span>' +
        '<span class="ct-br">' + (st.broken ? '! ' + st.broken + ' broken' : '✓ clean') + '</span></button>';
    }).join('') + '</div>' +
      '<p class="card-sub" style="margin:12px 0 0">Share of money moved that is acknowledged and reconciles. ' +
      '<b>Green</b> 98%+ · <b>amber</b> 90–98% · <b>red</b> below 90%.</p>';

    host.querySelectorAll('[data-cs]').forEach(function (b) {
      b.addEventListener('click', function () {
        S.state = (S.state === b.dataset.cs) ? '' : b.dataset.cs;
        var sel = document.getElementById('fState');
        if (sel) sel.value = S.state;
        S.node = S.state && CODE_OF[S.state] ? 'IN/' + CODE_OF[S.state] : 'IN';
        S.ledgerN = 40; S.spendN = 40;
        renderMap();
      });
    });
  }

  /* ================= dispatch ================= */
  function renderAll() {
    if (S.view !== 'dashboard' && window.__pdTick) { clearInterval(window.__pdTick); window.__pdTick = null; }
    if (S.view === 'dashboard') renderDashboard();
    else if (S.view === 'map') renderMap();
    else if (S.view === 'flow') renderFlow();
    else if (S.view === 'ledger') renderLedger();
    else if (S.view === 'flags') renderFlags();
    else if (S.view === 'spend') renderSpend();
    else if (S.view === 'reps') renderReps();
    else if (S.view === 'mytax') renderTax();
  }

  initChrome();
  renderAll();
})();
