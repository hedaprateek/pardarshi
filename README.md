# ParDarshi — Public Fund Transparency Chain

**A working demonstration of what end-to-end transparency of public money could look like in India.**

> ⚠️ **Everything on this site is synthetic.** Figures, people, parties, vendors, invoices and
> enforcement cases are fictional and generated to illustrate the model. Place names are real;
> nothing else is. This is not a government service and makes no claim about any real official,
> department or vendor.

---

## The idea

The state already knows, to the rupee, what every taxpayer owes. The same machinery can show every
citizen where that rupee went. The model is one rule applied at every tier:

1. **Every rupee collected is visible.** Tax receipts post to a single public ledger that anyone can watch accumulate.
2. **Approval debits the source.** A sanction moves money out of the national account and into a state's account as one identified transaction.
3. **States release to districts** — same rule, one tier down.
4. **Districts release to talukas / blocks.**
5. **…and so on, to the last mile** — ending at a work order against a named project with a named officer responsible.
6. **The receiver must acknowledge.** No transfer completes on the sender's word alone.
7. **Agreement turns the line green.** Sender's figure and receiver's figure reconcile, and the public sees a green path.
8. **Spending is itemised in public.** Infrastructure, equipment, imports, research — each bill names the vendor, who acknowledges receipt in turn.
9. **A gap raises a red flag.** Deviation beyond the permitted margin auto-generates a show-cause notice.
10. **Justify, or face action.** An accepted explanation closes the case and restores the green line. An unaccepted one triggers recovery, suspension or prosecution — and that outcome is public too.

## Why 1%

Real transfers lose small amounts to bank charges, rounding, exchange-rate movement and mid-year tax
revisions. A zero-tolerance rule would drown the system in false alarms and destroy its credibility
in a week. A narrow, published margin absorbs honest noise while leaving deliberate diversion
nowhere to hide — **diversion is never 0.9%.**

The site makes that argument visible: drag the **Permitted deviation** slider — or press **▶** beside
it to sweep 0% → 3% and settle back at 1% — and every status on the site recomputes live.

| Permitted deviation | Verified | Awaiting ack | Flagged |
|---|---|---|---|
| 0.0% | 0.5% | 3.5% | **95.9%** |
| 0.5% | 68.9% | 3.5% | 27.5% |
| **1.0%** | **91.3%** | **3.5%** | **5.2%** |
| 2.0% | 91.6% | 3.5% | 4.9% |
| 5.0% | 92.6% | 3.5% | 3.8% |

At 0% you get a flood of noise. By 1% only genuine gaps remain, and widening further buys almost
nothing — it just lets real diversion through. That flat tail past 1% is the whole argument for the
number.

## What's in the demo

| View | What it shows |
|---|---|
| **Dashboard** | Live-accumulating treasury counter, receipts vs last year, transfer integrity by state, spend by sector |
| **Chain map** | The whole hierarchy in one picture — five tiers as stacked bands, every block beneath the office that funded it, with red threads running from the top of the chart down to each broken link. Includes a month scrubber that rewinds the chain through the year and a tile cartogram of state integrity |
| **Fund flow** | Drill Union → State → District → Taluka → Project. Connectors are green only when both parties agree within tolerance |
| **Ledger** | Every transfer with sanction number, bank reference, released vs acknowledged amount, and deviation |
| **Red flags** | A flowchart of the rule itself with live counts on every branch, above the discrepancy register — show-cause notices, departmental replies, and the action taken when a reply is rejected |
| **Expenditure** | Bill-level disclosure: vendor, invoice, sector, geo-tagged proof, citizen verification counts |
| **Representatives** | MP/MLA scorecards from fund utilisation, physical progress and flag rate — plus a citizen star rating |
| **My taxes** | One taxpayer's contribution, their rupee apportioned by sector, and their share traced to works in their own district |
| **How it works** | The ten rules, the case for the 1% margin, and the honest limits of this demo |

## Honest limits

- Four districts per state and two blocks per district are traced. The untraced remainder is carried
  as an **explicit aggregate node**, so every tier still balances to the rupee rather than quietly
  losing money. The largest imbalance across all 368 nodes is ₹0.01 Cr (rounding).
- Acknowledgement timings, discrepancy rates and enforcement outcomes are modelled, not measured.
- Citizen ratings are stored in your own browser (`localStorage`) and go nowhere else.
- Party names are invented. No real political party is depicted.

## What already exists

None of this needs technology the state does not already run. **PFMS** handles fund flow, the
**GSTN** does invoice-level reconciliation, **Aadhaar-seeded DBT** covers last-mile transfers, and
**TIN** holds individual tax records. Each is a working tier of this chain. What is missing is a
single public surface that joins them, and an obligation to acknowledge.

## Running it

It is a static site with **no build step and no dependencies** — plain HTML, CSS and ES5 JavaScript.

```bash
git clone https://github.com/hedaprateek/pardarshi.git
cd pardarshi
python -m http.server 8000     # or: npx serve
```

Then open <http://localhost:8000>. Opening `index.html` directly from disk works too.

### Handy URLs

- `#flow:IN/MH/Pune/Haveli` — deep-link straight to any node in the chain
- `?theme=light` / `?theme=dark` — force a colour mode (useful on a projector)

### Layout

```
index.html            markup and copy
assets/css/app.css    design tokens, light + dark palettes
assets/js/data.js     seeded synthetic dataset — deterministic, so the demo never shifts
assets/js/charts.js   dependency-free SVG charts + Indian number formatting
assets/js/app.js      status engine, routing, and all seven views
```

Charts are hand-rolled inline SVG driven by CSS custom properties, so light/dark swaps for free.
The palette is validated for colour-vision deficiency; status colours always ship with an icon and a
label, so meaning never rests on hue alone.

## Licence

MIT — see [LICENSE](LICENSE). Use it, fork it, argue with it.
