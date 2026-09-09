/* ============================================================
   ParDarshi — synthetic demonstration dataset
   ------------------------------------------------------------
   ALL figures, people, parties, vendors, invoices and cases in
   this file are FICTIONAL and generated for demonstration only.
   Place names are real; nothing else is.
   Amounts are in ₹ crore unless stated otherwise.
   ============================================================ */
window.PD = (function () {
  'use strict';

  /* ---------- deterministic PRNG so the demo never changes ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rnd = mulberry32(20260910);
  var rand = function (a, b) { return a + (b - a) * rnd(); };
  var pick = function (a) { return a[Math.floor(rnd() * a.length)]; };
  var r2 = function (n) { return Math.round(n * 100) / 100; };

  var META = {
    fy: '2026-27',
    asOf: '10 September 2026',
    tolerance: 1.0,            // default permitted deviation, %
    unit: '₹ crore'
  };

  /* ================= 1. NATIONAL RECEIPTS ================= */
  // Cumulative net tax receipts to the Consolidated Fund, ₹ crore.
  var MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
  var CUM_PREV = [208000,462000,731000,1002000,1290000,1571000,1892000,2210000,2588000,2921000,3244000,3806000];
  var CUM_CURR = [232400,512900,806100,1104300,1428700,1592400];   // Sep is part-month (as on 10 Sep)

  var TREASURY = {
    collectedYTD:  1592400,
    openingBalance:  184300,
    disbursed:      1341780,
    get balance() { return this.openingBalance + this.collectedYTD - this.disbursed; },
    // for the live ticker: average net receipts per second, ₹ crore
    perSecond: 3806000 / (365 * 24 * 60 * 60)
  };

  // Head-of-account split of what has been disbursed from the Union pool.
  var UNION_HEADS = [
    { head: 'Transfers to States & UTs',            amount: 1000500 },
    { head: 'Centrally Sponsored Schemes',           amount: 148600 },
    { head: 'Defence services & capital acquisition',amount:  92400 },
    { head: 'Interest on public debt',               amount:  61200 },
    { head: 'Central sector establishment',          amount:  39080 }
  ];

  /* ================= 2. GEOGRAPHY ================= */
  // Real administrative names. Four representative districts per state,
  // two representative talukas per district — the untraced remainder is
  // carried as an explicit aggregate node so every tier balances exactly.
  var GEO = [
    { state: 'Uttar Pradesh', code: 'UP', allocation: 218400, districts: [
      { name: 'Lucknow',    talukas: ['Malihabad', 'Mohanlalganj'] },
      { name: 'Varanasi',   talukas: ['Pindra', 'Rajatalab'] },
      { name: 'Gorakhpur',  talukas: ['Sahjanwa', 'Chauri Chaura'] },
      { name: 'Agra',       talukas: ['Etmadpur', 'Kiraoli'] }
    ]},
    { state: 'Maharashtra', code: 'MH', allocation: 172900, districts: [
      { name: 'Pune',       talukas: ['Haveli', 'Baramati'] },
      { name: 'Nagpur',     talukas: ['Katol', 'Ramtek'] },
      { name: 'Nashik',     talukas: ['Sinnar', 'Igatpuri'] },
      { name: 'Chhatrapati Sambhajinagar', talukas: ['Paithan', 'Vaijapur'] }
    ]},
    { state: 'Bihar', code: 'BR', allocation: 141200, districts: [
      { name: 'Patna',      talukas: ['Danapur', 'Barh'] },
      { name: 'Gaya',       talukas: ['Bodh Gaya', 'Sherghati'] },
      { name: 'Muzaffarpur',talukas: ['Kanti', 'Sakra'] },
      { name: 'Bhagalpur',  talukas: ['Naugachhia', 'Kahalgaon'] }
    ]},
    { state: 'West Bengal', code: 'WB', allocation: 118600, districts: [
      { name: 'Kolkata',    talukas: ['Behala', 'Jadavpur'] },
      { name: 'Howrah',     talukas: ['Bally', 'Domjur'] },
      { name: 'Darjeeling', talukas: ['Kurseong', 'Mirik'] },
      { name: 'Murshidabad',talukas: ['Berhampore', 'Jangipur'] }
    ]},
    { state: 'Tamil Nadu', code: 'TN', allocation: 96300, districts: [
      { name: 'Chennai',    talukas: ['Ambattur', 'Sholinganallur'] },
      { name: 'Coimbatore', talukas: ['Mettupalayam', 'Pollachi'] },
      { name: 'Madurai',    talukas: ['Melur', 'Usilampatti'] },
      { name: 'Salem',      talukas: ['Attur', 'Omalur'] }
    ]},
    { state: 'Karnataka', code: 'KA', allocation: 88700, districts: [
      { name: 'Bengaluru Urban', talukas: ['Anekal', 'Yelahanka'] },
      { name: 'Mysuru',     talukas: ['Nanjangud', 'T. Narasipura'] },
      { name: 'Belagavi',   talukas: ['Bailhongal', 'Chikkodi'] },
      { name: 'Kalaburagi', talukas: ['Aland', 'Afzalpur'] }
    ]},
    { state: 'Gujarat', code: 'GJ', allocation: 84500, districts: [
      { name: 'Ahmedabad',  talukas: ['Daskroi', 'Sanand'] },
      { name: 'Surat',      talukas: ['Choryasi', 'Bardoli'] },
      { name: 'Rajkot',     talukas: ['Gondal', 'Jetpur'] },
      { name: 'Kutch',      talukas: ['Bhuj', 'Anjar'] }
    ]},
    { state: 'Rajasthan', code: 'RJ', allocation: 79900, districts: [
      { name: 'Jaipur',     talukas: ['Amber', 'Chomu'] },
      { name: 'Jodhpur',    talukas: ['Bilara', 'Phalodi'] },
      { name: 'Udaipur',    talukas: ['Girwa', 'Salumbar'] },
      { name: 'Kota',       talukas: ['Ladpura', 'Digod'] }
    ]}
  ];

  /* ================= 3. VOCABULARY ================= */
  var CATEGORIES = [
    'Roads & Bridges', 'Water & Sanitation', 'Health', 'Education',
    'Power & Renewables', 'Agriculture & Irrigation', 'Digital Public Infra',
    'Research & Innovation', 'Imports & Equipment', 'Welfare Transfers'
  ];

  var PROJECT_TEMPLATES = [
    { t: '{p} Rural Road Package (PMGSY-III)',      c: 'Roads & Bridges' },
    { t: 'Bridge over {p} Nala',                     c: 'Roads & Bridges' },
    { t: '{p} Piped Water Grid',                     c: 'Water & Sanitation' },
    { t: '{p} Sewage Treatment Plant',               c: 'Water & Sanitation' },
    { t: '{p} Primary Health Centre Upgradation',    c: 'Health' },
    { t: '{p} District Hospital Oxygen Plant',       c: 'Health' },
    { t: '{p} Smart Classroom Rollout',              c: 'Education' },
    { t: '{p} Model School Construction',            c: 'Education' },
    { t: '{p} Solar Micro-grid',                     c: 'Power & Renewables' },
    { t: '{p} Feeder Separation Works',              c: 'Power & Renewables' },
    { t: '{p} Lift Irrigation Scheme',               c: 'Agriculture & Irrigation' },
    { t: '{p} Cold Storage & Market Yard',           c: 'Agriculture & Irrigation' },
    { t: '{p} Fibre Backbone (BharatNet)',           c: 'Digital Public Infra' },
    { t: '{p} Common Service Centre Network',        c: 'Digital Public Infra' },
    { t: '{p} Agri-Research Field Station',          c: 'Research & Innovation' },
    { t: '{p} Skill Development Centre',             c: 'Research & Innovation' },
    { t: '{p} Imported Diagnostic Equipment',        c: 'Imports & Equipment' },
    { t: '{p} Anganwadi Modernisation',              c: 'Welfare Transfers' }
  ];

  var VENDORS = [
    'Bhoomi Infratech Pvt Ltd', 'Sahyadri Constructions', 'NavaTech Systems Ltd',
    'Ganga Civil Works', 'Deccan Medisys Pvt Ltd', 'Suryodaya Solar Pvt Ltd',
    'Vindhya Roadways & Bridges', 'Kaveri Water Solutions', 'Prayas Edu Supplies',
    'Trinetra Instruments Pvt Ltd', 'Aravalli Engineering Co.', 'Meghdoot Agritech'
  ];

  var JUSTIFIED = [
    'Cost escalation approved under revised administrative sanction dated {d}. Price variation clause invoked for cement and steel.',
    'Foreign-exchange variation on imported equipment between LC opening and retirement. RBI reference rate placed on record.',
    'GST rate revision on works contract mid-execution; differential tax paid to the vendor against valid invoices.',
    'Land compensation enhanced by order of the Reference Court under the RFCTLARR Act, 2013. Decree copy uploaded.',
    'Additional quantity certified in the Measurement Book after a court-ordered realignment of the approved route.'
  ];
  var NOT_JUSTIFIED = [
    'No supporting invoices produced for the differential amount despite three reminders.',
    'Running-bill payment released to a vendor already debarred; debarment order predates the release.',
    'Measurement Book entries do not reconcile with the joint site inspection report of {d}.',
    'Beneficiary list contains duplicate seeding; 1,142 records resolve to the same bank account.',
    'Advance drawn against a work not commenced; utilisation certificate signed in anticipation.'
  ];
  var ACTIONS = [
    'FIR registered under §13(1)(b), Prevention of Corruption Act, 1988. Investigation with the State Vigilance Bureau.',
    'Recovery order issued for the full differential with 12% interest; salary attachment ordered.',
    'Executive Engineer placed under suspension; departmental enquiry initiated under CCS (CCA) Rules.',
    'Vendor debarred for three years; performance guarantee encashed and credited back to the treasury.',
    'Matter referred to the Chief Vigilance Commission; disciplinary proceedings against two officers.'
  ];

  var FIRST = ['Anil','Sunita','Ramesh','Kavita','Praveen','Meera','Rajendra','Lata','Suresh','Nandini',
    'Vikram','Shalini','Arun','Rekha','Mahesh','Pooja','Dinesh','Asha','Gopal','Sneha',
    'Harish','Vandana','Naresh','Jyoti','Prakash','Sarita','Manoj','Deepa','Yogesh','Anjali'];
  var LAST = ['Deshmukh','Verma','Iyer','Chauhan','Nair','Bhattacharya','Patel','Reddy','Sharma','Kulkarni',
    'Yadav','Mishra','Rao','Gowda','Banerjee','Joshi','Pandey','Menon','Shinde','Trivedi'];
  // Deliberately fictional party labels — no real party is depicted.
  var PARTIES = ['Jan Vikas Party','Rashtriya Samta Dal','Lok Nirman Manch','Pragati Party','Independent'];

  /* ================= 4. BUILD THE LEDGER ================= */
  var nodes = {};      // id -> node
  var txns = [];       // every transfer between two tiers
  var spends = [];     // terminal expenditure line items
  var seq = { txn: 0, inv: 0 };

  function nid(parts) { return parts.join('/').replace(/[^A-Za-z0-9/]+/g, '-'); }

  function addNode(n) { nodes[n.id] = n; return n; }

  function dateIn(monthIdx, dayLo, dayHi) {
    var m = ['04','05','06','07','08','09'][monthIdx];
    var y = '2026';
    var d = Math.floor(rand(dayLo, dayHi));
    return (d < 10 ? '0' + d : d) + '-' + m + '-' + y;
  }

  // Decide the acknowledgement behaviour of a transfer.
  // ~90% clean, ~6% awaiting acknowledgement, ~4% mismatched.
  function makeAck(amount, tier) {
    // Aggregate buckets are a demo scaffold, not a real counterparty — keep them
    // clean so every red flag on the site points at a named office or work.
    if (tier === 'aggregate') {
      return { ackAmount: r2(amount * (1 + rand(-0.002, 0.002))), ackDate: null, pending: false };
    }
    var roll = rnd();
    if (roll < 0.06) return { ackAmount: null, ackDate: null, pending: true };
    var mismatchRate = tier === 'project' ? 0.055 : 0.035;
    if (roll < 0.06 + mismatchRate) {
      var dev = rand(0.011, 0.14) * (rnd() < 0.78 ? -1 : 1);  // usually receiver got LESS
      return { ackAmount: r2(amount * (1 + dev)), ackDate: null, pending: false, mismatch: true };
    }
    // Clean: honest noise only — bank charges, rounding, forex, mid-year revisions.
    // Skewed hard toward zero with a thin tail approaching (but never crossing) 1%,
    // so that sliding the permitted deviation from 0% to 1% visibly separates
    // background noise from real diversion.
    var drift = 0.0095 * Math.pow(rnd(), 1.7) * (rnd() < 0.5 ? -1 : 1);
    return { ackAmount: r2(amount * (1 + drift)), ackDate: null, pending: false };
  }

  function makeTxn(from, to, amount, tier, purpose) {
    var a = makeAck(amount, tier);
    var mIdx = Math.floor(rand(0, 5.99));
    var sentOn = dateIn(mIdx, 2, 27);
    seq.txn++;
    var t = {
      id: 'TXN-' + META.fy.replace('-', '') + '-' + String(100000 + seq.txn),
      from: from, to: to, tier: tier, purpose: purpose,
      amount: r2(amount),
      ackAmount: a.ackAmount,
      pending: !!a.pending,
      sentOn: sentOn,
      ackOn: a.pending ? null : dateIn(mIdx, 4, 28),
      sanction: 'SAN/' + META.fy.replace('-', '/') + '/' + String(4000 + seq.txn),
      utr: 'UTR' + Math.floor(rand(1e11, 9.9e11)),
      // narrative used only if the deviation breaches the tolerance in force
      caseNarrative: (function () {
        var justified = rnd() < 0.45;
        var d = dateIn(Math.floor(rand(0, 5.99)), 3, 26);
        return {
          justified: justified,
          explanation: (justified ? pick(JUSTIFIED) : pick(NOT_JUSTIFIED)).replace('{d}', d),
          action: justified ? null : pick(ACTIONS),
          noticeNo: 'SCN/' + META.fy.replace('-', '/') + '/' + String(700 + seq.txn),
          noticeOn: d,
          repliedOn: rnd() < 0.85 ? dateIn(5, 1, 9) : null
        };
      })()
    };
    txns.push(t);
    return t;
  }

  function makeSpends(project, budget) {
    var n = Math.floor(rand(2, 4.99));
    var left = budget;
    var out = [];
    for (var i = 0; i < n; i++) {
      var share = (i === n - 1) ? left : r2(left * rand(0.28, 0.55));
      left = r2(left - share);
      if (share <= 0) break;
      seq.inv++;
      var acked = rnd() > 0.07;
      var dev = rnd() < 0.06 ? rand(0.015, 0.11) : rand(-0.003, 0.003);
      out.push({
        id: 'INV-' + String(50000 + seq.inv),
        project: project.id,
        projectName: project.name,
        state: project.state,
        district: project.district,
        category: project.category,
        item: pick([
          'Civil works — running bill', 'Supply & installation of equipment',
          'Consultancy & DPR preparation', 'Material procurement — cement & steel',
          'Labour & site establishment', 'Third-party quality audit',
          'Imported components (CIF)', 'Electrical & instrumentation works'
        ]),
        vendor: pick(VENDORS),
        amount: r2(share),
        vendorAck: acked ? r2(share * (1 + dev)) : null,
        billedOn: dateIn(Math.floor(rand(0, 5.99)), 2, 27),
        geoProof: rnd() > 0.18,
        citizenVerifications: Math.floor(rand(0, 480))
      });
    }
    spends.push.apply(spends, out);
    return out;
  }

  /* ---- Tier 0: the Union treasury ---- */
  var UNION = addNode({
    id: 'IN', tier: 'union', name: 'Union Treasury — Consolidated Fund of India',
    short: 'Union Treasury', parent: null,
    received: TREASURY.collectedYTD, children: []
  });

  /* ---- Tier 1..4 ---- */
  GEO.forEach(function (S) {
    var sId = nid(['IN', S.code]);
    var stateNode = addNode({
      id: sId, tier: 'state', name: S.state + ' — State Treasury', short: S.state,
      parent: 'IN', code: S.code, state: S.state, received: S.allocation, children: []
    });
    UNION.children.push(sId);
    makeTxn('IN', sId, S.allocation, 'state', 'Devolution & central assistance, ' + META.fy);

    // State retains a slice for state-level schemes and establishment
    stateNode.retained = r2(S.allocation * rand(0.05, 0.09));
    var toDistricts = r2(S.allocation - stateNode.retained);

    // Four traced districts take ~30–40% between them; rest is an explicit aggregate
    var tracedShare = rand(0.30, 0.40);
    var tracedPool = r2(toDistricts * tracedShare);
    var dW = S.districts.map(function () { return rand(0.8, 1.4); });
    var dSum = dW.reduce(function (a, b) { return a + b; }, 0);

    S.districts.forEach(function (D, di) {
      var dAmt = r2(tracedPool * dW[di] / dSum);
      var dId = nid([sId, D.name]);
      var dNode = addNode({
        id: dId, tier: 'district', name: D.name + ' — District Treasury', short: D.name,
        parent: sId, state: S.state, district: D.name, received: dAmt, children: []
      });
      stateNode.children.push(dId);
      makeTxn(sId, dId, dAmt, 'district', 'District allocation, ' + META.fy);

      dNode.retained = r2(dAmt * rand(0.06, 0.11));
      var toTalukas = r2(dAmt - dNode.retained);
      var tTracedPool = r2(toTalukas * rand(0.45, 0.60));
      var tW = D.talukas.map(function () { return rand(0.8, 1.3); });
      var tSum = tW.reduce(function (a, b) { return a + b; }, 0);

      D.talukas.forEach(function (T, ti) {
        var tAmt = r2(tTracedPool * tW[ti] / tSum);
        var tId = nid([dId, T]);
        var tNode = addNode({
          id: tId, tier: 'taluka', name: T + ' — Block/Taluka Office', short: T,
          parent: dId, state: S.state, district: D.name, taluka: T, received: tAmt, children: []
        });
        dNode.children.push(tId);
        makeTxn(dId, tId, tAmt, 'taluka', 'Block allocation, ' + META.fy);

        tNode.retained = r2(tAmt * rand(0.04, 0.09));
        var toProjects = r2(tAmt - tNode.retained);
        var pTracedPool = r2(toProjects * rand(0.60, 0.85));
        var np = Math.floor(rand(2, 3.99));
        var pW = []; for (var k = 0; k < np; k++) pW.push(rand(0.7, 1.5));
        var pSum = pW.reduce(function (a, b) { return a + b; }, 0);

        for (var pi = 0; pi < np; pi++) {
          var pAmt = r2(pTracedPool * pW[pi] / pSum);
          var tpl = pick(PROJECT_TEMPLATES);
          var pName = tpl.t.replace('{p}', T);
          var pId = nid([tId, 'P' + (pi + 1)]);
          var pNode = addNode({
            id: pId, tier: 'project', name: pName, short: pName,
            parent: tId, state: S.state, district: D.name, taluka: T,
            category: tpl.c, received: pAmt, children: [],
            physicalProgress: Math.round(rand(18, 100)),
            engineer: pick(FIRST) + ' ' + pick(LAST)
          });
          tNode.children.push(pId);
          makeTxn(tId, pId, pAmt, 'project', 'Work order release — ' + pName);

          var spentPortion = r2(pAmt * rand(0.45, 0.98));
          pNode.spent = spentPortion;
          pNode.unspent = r2(pAmt - spentPortion);
          makeSpends(pNode, spentPortion);
        }

        var tRem = r2(toProjects - pTracedPool);
        if (tRem > 0.5) {
          var tRemId = nid([tId, 'other-works']);
          addNode({ id: tRemId, tier: 'aggregate', name: 'Other sanctioned works in ' + T + ' (aggregate)',
            short: 'Other works — ' + T, parent: tId, state: S.state, district: D.name, taluka: T,
            received: tRem, children: [], aggregate: true });
          tNode.children.push(tRemId);
          makeTxn(tId, tRemId, tRem, 'aggregate', 'Aggregate of remaining sanctioned works');
        }
      });

      var dRem = r2(toTalukas - tTracedPool);
      if (dRem > 0.5) {
        var dRemId = nid([dId, 'other-blocks']);
        addNode({ id: dRemId, tier: 'aggregate', name: 'Other blocks of ' + D.name + ' (aggregate)',
          short: 'Other blocks — ' + D.name, parent: dId, state: S.state, district: D.name,
          received: dRem, children: [], aggregate: true });
        dNode.children.push(dRemId);
        makeTxn(dId, dRemId, dRem, 'aggregate', 'Aggregate of remaining blocks');
      }
    });

    var sRem = r2(toDistricts - tracedPool);
    if (sRem > 0.5) {
      var sRemId = nid([sId, 'other-districts']);
      addNode({ id: sRemId, tier: 'aggregate', name: 'Other districts of ' + S.state + ' (aggregate)',
        short: 'Other districts — ' + S.state, parent: sId, state: S.state,
        received: sRem, children: [], aggregate: true });
      stateNode.children.push(sRemId);
      makeTxn(sId, sRemId, sRem, 'aggregate', 'Aggregate of remaining districts');
    }
  });

  /* ================= 5. REPRESENTATIVES ================= */
  // One MP per traced district, two MLAs per district (one per traced taluka).
  var reps = [];
  GEO.forEach(function (S) {
    S.districts.forEach(function (D) {
      reps.push({
        id: nid(['MP', S.code, D.name]),
        name: pick(FIRST) + ' ' + pick(LAST),
        house: 'Lok Sabha (MP)',
        constituency: D.name,
        state: S.state,
        party: pick(PARTIES),
        termYears: Math.floor(rand(1, 9)),
        attendance: Math.round(rand(48, 98)),
        questionsRaised: Math.floor(rand(4, 160)),
        seedRating: r2(rand(2.1, 4.8)),
        seedVotes: Math.floor(rand(280, 9400))
      });
      D.talukas.forEach(function (T) {
        reps.push({
          id: nid(['MLA', S.code, D.name, T]),
          name: pick(FIRST) + ' ' + pick(LAST),
          house: 'Vidhan Sabha (MLA)',
          constituency: T,
          state: S.state,
          district: D.name,
          party: pick(PARTIES),
          termYears: Math.floor(rand(1, 6)),
          attendance: Math.round(rand(42, 99)),
          questionsRaised: Math.floor(rand(2, 120)),
          seedRating: r2(rand(1.8, 4.9)),
          seedVotes: Math.floor(rand(120, 5200))
        });
      });
    });
  });

  /* ================= 6. TAXPAYER PROFILES ================= */
  // Individual view: what one citizen paid, and where it landed.
  var TAXPAYERS = [
    { pan: 'AJKPS4412M', name: 'Salaried professional, Pune',
      city: 'Pune', state: 'Maharashtra', district: 'Pune',
      grossIncome: 1840000, taxPaidFY: 341600,
      monthly: [28466,28466,28466,28466,28466,28466,28466,28466,28466,28466,28466,28474] },
    { pan: 'BQWPD9087H', name: 'Small business owner, Surat',
      city: 'Surat', state: 'Gujarat', district: 'Surat',
      grossIncome: 3260000, taxPaidFY: 812400,
      monthly: [61000,61000,61000,143400,61000,61000,61000,143000,61000,61000,61000,38000] },
    { pan: 'CDLPK2210R', name: 'Senior consultant, Bengaluru',
      city: 'Bengaluru', state: 'Karnataka', district: 'Bengaluru Urban',
      grossIncome: 5420000, taxPaidFY: 1489300,
      monthly: [110000,110000,110000,310000,110000,110000,110000,310000,110000,110000,110000,79300] }
  ];

  /* ================= 7. DERIVED INDEXES ================= */
  var txnByTo = {};
  txns.forEach(function (t) { txnByTo[t.to] = t; });

  var spendsByProject = {};
  spends.forEach(function (s) {
    (spendsByProject[s.project] = spendsByProject[s.project] || []).push(s);
  });

  return {
    META: META, MONTHS: MONTHS, CUM_PREV: CUM_PREV, CUM_CURR: CUM_CURR,
    TREASURY: TREASURY, UNION_HEADS: UNION_HEADS, CATEGORIES: CATEGORIES,
    GEO: GEO, nodes: nodes, txns: txns, spends: spends,
    txnByTo: txnByTo, spendsByProject: spendsByProject,
    reps: reps, TAXPAYERS: TAXPAYERS
  };
})();
