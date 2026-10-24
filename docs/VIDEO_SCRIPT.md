# Windwise video script and shot plan

Two recordings, each **under 5 minutes**. Record at 1920×1080, browser at 100% zoom, notifications
off. The demo is a historical January 2026 replay; say that explicitly in the first 20 seconds.

- **Part 1 — client pitch:** 4:45 target, hard stop 5:00.
- **Part 2 — technical review:** 4:45 target, hard stop 5:00.
- **Live URL:** <https://windwise-henna.vercel.app>
- **Repo:** <https://github.com/sohan-a11y/windwise>

The narration below is written to be read at a calm ~145 words per minute. Timings are cues, not
prison. If you overrun, cut the bracketed sentences first.

---

## Part 1 — client pitch

### Cold open (0:00–0:25)

**Screen:** Desk at `/?view=desk&date=2026-01-31&gate=n2ex&share=10`. Let the hero settle for two
seconds before speaking.

**Narration:**

> On the last day of January 2026, the national wind forecast told a GB supplier to expect 12.3
> gigawatts of wind. The same forecast, calibrated against the month's outturn, said plan on 10.6.
> And the 90% firm floor was 8.3. Windwise is the desk that turns those three numbers into an
> hourly procurement decision.

**Action:** do not move the mouse. Let the headline and the windscape breathe.

### The problem (0:25–1:10)

**Screen:** stay on the hero, then move to the four metric cards.

**Narration:**

> A supplier with a share of national wind does not buy "the forecast". It buys cover against the
> risk that the forecast is wrong. In January 2026 it was wrong in a specific direction: WINDFOR
> over-forecast outturn in 84% of hours. Raw bias was plus 1.84 gigawatts. Mean absolute error was
> 2.1 gigawatts. On 28 January the forecast was 5.4 gigawatts hot, and the 80% band held for zero
> of 24 hours.
>
> That is not a rounding error. It is a thermal-capacity decision hiding inside a point forecast.

**Action:** hover the "30 Jan · 09:30Z" snapshot chip to show the gate provenance; move to the
"Calibrated expectation" card.

### The product (1:10–2:05)

**Screen:** click **Size the cover** to scroll to the calculator, or scroll to the "What is
forecast, what is firm" chart and calculator.

**Narration:**

> Three controls drive the desk. The delivery date, the market gate, and the client's share of
> national wind.
>
> The gate matters because the decision does. N2EX closes at 09:50. Windwise uses the latest
> complete WINDFOR snapshot published before that cut-off. No future snapshot, no revision after
> the gate, no look-ahead.
>
> The chart is the argument. The dotted line is raw WINDFOR. The solid line is the calibrated
> expectation. The shaded bands are empirical P10–P90 and P2.5–P97.5 residuals, measured
> leave-one-day-out. The firm-90 line is the floor the buyer can actually plan against.

**Action:** point to the raw line, calibrated line, band, firm line. Then drag the share slider from
10% to 20% and back to 10%.

### The decision (2:05–3:00)

**Screen:** cover calculator at 10% share.

**Narration:**

> At a 10% share, the 90% tier says hold 451 megawatts at the peak hour, and 9,568 megawatt-hours
> across the day. The 80% tier is 346 megawatts and 7,034 megawatt-hours. The stress case is 699
> megawatts and 15,516 megawatt-hours.
>
> This is not a trade. It is a thermal-capacity proxy: the MW a buyer would hold against their
> share of a national wind shortfall. The formula is deliberately simple: share times the positive
> gap between forecast and firm wind, floored at zero. No prices, no demand model, no invented
> megawatts.
>
> The realised coverage is printed next to every tier. 85.1% for the 80% floor. 88.9% for the 90%
> floor. 97.3% for stress. We show the miss, not just the label.

**Action:** click each tier once; pause on the realisation text under each label. Do not claim
"95% firm".

### The evidence (3:00–3:50)

**Screen:** click **Accuracy** in the header.

**Narration:**

> The accuracy view is the audit trail. Raw bias is plus 1.84 gigawatts; calibrated bias is plus
> 0.11. Raw MAE is 2,123 megawatts; calibrated MAE is 1,263 — a 40.5% reduction. That is the
> honest gain, not a perfect forecast.
>
> The central 80% band realised 80.6% coverage. The nominal 95% band realised 90.6%, because the
> tail is heavy. The largest single miss was 6,833 megawatts on 12 January at 01:00. The 28 January
> event is in the ledger with zero band hits. The product is designed to make those failures
> legible.

**Action:** scroll to the coverage table and the worst-hours table. Hover one scatter point if the
tooltip appears.

### Why it matters (3:50–4:30)

**Screen:** click **Snapshots**, then **Method**.

**Narration:**

> The snapshot view shows that a forecast is not one number. It is a sequence of revisions. On 16
> January the scheduled EPEX half-hourly snapshot was missing; Windwise falls back to the 12:25
> publication and flags it. The desk never silently smooths a gap.
>
> The method page states the rules, the data provenance, the checksum, the limitations, and the AI
> disclosure. One ratio, one month, one committed snapshot. A buyer can reproduce every number.

**Action:** on Snapshots, point to the fallback callout. On Method, scroll to the provenance card
and the AI disclosure.

### Close (4:30–4:50)

**Screen:** return to Desk at 31 January.

**Narration:**

> Windwise does not promise better wind. It prices the uncertainty around the wind we have, at the
> gate where the decision is made. The forecast says 12.3. Plan on 8.3. That is the product.

**Action:** stop on the hero. Hold two seconds. Stop recording.

---

## Part 2 — technical review

### Architecture (0:00–0:35)

**Screen:** `docs/ARCHITECTURE.md` rendered on GitHub, or a simple architecture slide.

**Narration:**

> Windwise is a React 19 and TypeScript client, a FastAPI analytics service, and one committed
> SQLite snapshot. There is no database server, no background worker, and no external call at
> request time.
>
> The same backend runs in Docker and as a Vercel Python function. The client is a static Vite
> build. The snapshot is hashed at boot, so the numbers are reproducible.

### Data and gates (0:35–1:25)

**Screen:** Desk with the date and gate controls; then Snapshots.

**Narration:**

> The data is two public Elexon datasets: FUELHH wind actuals and WINDFOR forecasts, January 2026.
> 1,488 actual half-hours, 18,688 forecast rows, 256 snapshots.
>
> A gate is a cut-off on the day before delivery. N2EX closes at 09:50; EPEX GB at 09:20; EPEX GB
> half-hourly at 15:30. For each delivery day we take the latest complete snapshot published
> strictly before that cut-off. If the expected snapshot is missing, we fall back and flag it. The
> 16 January EPEX HH case is the only fallback in the month.

**Action:** switch gate from N2EX to EPEX HH and back; open Snapshots for 16 January if time allows.

### Calibration and bands (1:25–2:20)

**Screen:** Method page, then Accuracy page.

**Narration:**

> Calibration is one parameter: k equals total actual divided by total forecast, over complete
> delivery days at or before D-2. Seven complete days are required, so 1–8 January are provisional
> and calibration unlocks on the 9th.
>
> On 31 January, k is 0.861 from 29 days, or 696 hourly pairs. Calibrated expectation is k times the
> forecast. No intercept, no wind-level slope, no separate model per gate.
>
> Bands come from leave-one-day-out residuals. Each historical day is scored with a k estimated
> without that day, so the band is not narrowed by in-sample fitting. The quantiles are empirical:
> P10–P90 for the central 80%, P2.5–P97.5 for the central 95%, P20 and P10 for the one-sided firm
> floors, and the minimum residual for stress.

### Cover and the client (2:20–3:05)

**Screen:** Desk cover calculator; click a table row to focus an hour.

**Narration:**

> Cover is share times max of zero and forecast minus firm wind, floored at zero. MWh is the sum of
> the 24 hourly MW values.
>
> The API returns the hourly book and the server-side summary. The client recomputes the same
> formula for the slider so the interaction is instant. Both formulas are covered by tests. The
> table lets a buyer click any hour and see it on the chart.
>
> The UI is a light editorial system: custom SVG charts, a data-linked isometric windscape,
> reduced-motion support, and a mobile layout down to 390 pixels.

**Action:** click 00:00, then 12:00 in the hourly book; switch tier to Stress; return to 90%.

### Engineering quality (3:05–3:50)

**Screen:** GitHub Actions / terminal test output, or the Method page quality card.

**Narration:**

> Thirty-seven backend tests cover gate selection, hourly matching, calibration timing, LODO bands,
> cover arithmetic, API contracts, CSV exports, and no-look-ahead mutation cases. Thirteen frontend
> tests cover URL canonicalisation and cover math. TypeScript is strict. CI runs the backend suite,
> the frontend typecheck, tests, and a production build on every push.
>
> The API adds request IDs, security headers, gzip, structured errors, and a checksum-verified
> health endpoint. The snapshot hash is checked at boot; a mismatch is reported as degraded, not
> ignored.

### Deployment (3:50–4:30)

**Screen:** live Vercel URL, `/api/docs`, CSV download.

**Narration:**

> On Vercel, the frontend is static output and `/api/*` is rewritten to a Python function. The
> function bundles the SQLite file. The path normaliser restores the original API path from the
> rewrite, so FastAPI sees the same routes as it does locally.
>
> The Docker image is a two-stage build: Node builds the client, Python serves the API and the SPA
> from one process. It honours PORT, so it also runs on Heroku's container stack. I verified the
> container health endpoint, the SPA, both CSV exports, and the API docs before deploying.

**Action:** open `/api/docs`, execute `/api/v1/health`, download the hourly CSV. Show the first row.

### Limitations and close (4:30–4:50)

**Screen:** Method page limitations / FAQ.

**Narration:**

> The limits are real. One month is not a season. A single ratio assumes a stable bias, and January
> violates that in the tail. Empirical bands are not guarantees. There are no prices, no demand,
> and no live ingestion.
>
> Windwise is a decision-support prototype built to make those limits visible. The next step would
> be live ingestion and a multi-season calibration, not a more complicated model on one month of
> data.

**Action:** stop on the limitations card. Stop recording.

---

## Storyboard

| # | Time | Visual | Action | Message |
| --- | --- | --- | --- | --- |
| 1 | 0:00 | Desk hero | None | 12.3 forecast, 8.3 firm: the gap is the product |
| 2 | 0:25 | Metric cards | Hover snapshot chip | 84% over-forecast, +1.84 GW bias |
| 3 | 1:10 | Forecast chart | Point to raw/calibrated/band/firm | One forecast, four readings |
| 4 | 2:05 | Cover calculator | Click 80/90/stress; slide share | 451 MW / 9,568 MWh at 10% |
| 5 | 3:00 | Accuracy | Scroll to coverage + worst | 40.5% MAE cut; 80.6% realised |
| 6 | 3:30 | Accuracy | 28 Jan / 12 Jan evidence | The product shows failure |
| 7 | 3:50 | Snapshots | 16 Jan fallback | Revisions and missing data are visible |
| 8 | 4:10 | Method | Provenance + disclosure | Auditable, reproducible, honest |
| 9 | 4:30 | Desk hero | Hold | Close |
| 10 | P2 0:00 | Architecture | None | React + FastAPI + committed SQLite |
| 11 | P2 0:35 | Desk/Snapshots | Switch gate | Gate-timed snapshot selection |
| 12 | P2 1:25 | Method/Accuracy | Calibration card | k, D-2, LODO bands |
| 13 | P2 2:20 | Cover/table | Click hours, tiers | Cover formula and client parity |
| 14 | P2 3:05 | CI/tests | Show test output | 37 + 13 tests, strict TS |
| 15 | P2 3:50 | Live URL/API | Health + CSV | Vercel + Docker verified |
| 16 | P2 4:30 | Limitations | Hold | Scope and next steps |

---

## Click-by-click demo path

Use this exact path while recording. Open a fresh incognito window so the URL bar is clean and no
extensions or cached state appear.

### Before recording

1. Open the live URL.
2. Press `F11` for full screen. Hide bookmarks. Set browser zoom to 100%.
3. Close all other tabs. Turn off notifications and system sounds.
4. Have the script on a second screen or phone, not on the recorded screen.
5. Test the microphone for 10 seconds. Record a 5-second silence, then clap once to check sync.

### Part 1 path

1. Open `/?view=desk&date=2026-01-31&gate=n2ex&share=10`.
2. Wait for the hero, metric cards, and chart to finish animating (~2 seconds).
3. Hover the **30 Jan · 09:30Z** chip in the Desk header.
4. Click **Size the cover**. The page scrolls to the calculator.
5. On the chart, point to the dotted raw line, solid calibrated line, shaded band, and dashed firm
   line. Do not click.
6. In the cover calculator, click **80% confidence**, pause, then **90% confidence**, pause, then
   **Stress case**. Return to **90% confidence**.
7. Drag the share slider from 10% to 20%, pause, then back to 10%. The headline and MWh update.
8. Click header **Accuracy**.
9. Scroll to the coverage table (central 80/95 and one-sided 80/90/stress). Pause on 80.6% and
   90.6%.
10. Scroll to "Worst hours" and the 28 January evidence. Do not open a different date yet.
11. Click header **Snapshots**. Point to the selected pre-gate snapshot and the 16 January fallback
    callout if visible.
12. Click header **Method**. Scroll to "Provenance" and "AI tool disclosure".
13. Click header **Desk** to return. Stop on the hero.

### Part 2 path

1. Open `/?view=desk&date=2026-01-31&gate=n2ex&share=10`.
2. Switch the gate control to **EPEX HH 15:30**, pause, then back to **N2EX 09:50**.
3. Click header **Snapshots**. If the page opens on 31 January, use the date control to go to **16
   January** and show the EPEX HH fallback. Return to 31 January.
4. Click header **Accuracy**. Point to raw vs calibrated bias/MAE and the gate comparison table.
5. Click header **Method**. Point to the calibration formula, `k ≈ 0.861`, the LODO explanation,
   and the coverage honesty note.
6. Click header **Desk**. In the hourly book, click **00:00**; the chart focuses that hour. Click
   **12:00**; then click **00:00** again to clear.
7. Click **Stress case** in the cover calculator, then back to **90% confidence**.
8. Open `/api/docs` in a new tab. Expand `GET /api/v1/health`, click **Try it out**, then **Execute**.
   Show `status: ok` and `checksum_verified: true`.
9. Open `/api/v1/export/hourly.csv?date=2026-01-31&gate=n2ex&share=10` in a new tab. Show the first
   row: `2026-01-31,N2EX 09:50,2026-01-30T09:30:00Z,00:00,16109.0,13874.0,...`.
10. Return to the app. Scroll to the limitations card on the Method page. Stop recording.

### Backup path if the network fails

The Docker image is the fallback demo:

```bash
docker compose up --build
```

Open `http://localhost:8000`. Every screen, API route, CSV, and health check is identical. Say
"this is the same production image running locally" and continue. Do not record a broken network.

---

## Recording checklist

- [ ] 1920×1080, 30 fps, browser at 100%.
- [ ] Part 1 under 5:00; Part 2 under 5:00. Check the file duration, not the timer.
- [ ] Say "historical January 2026 replay" in Part 1.
- [ ] Say "not a trade, not a price forecast" when showing cover.
- [ ] Say "empirical bands are not guarantees" when showing coverage.
- [ ] Show the 16 January fallback or mention it.
- [ ] Show the AI disclosure on the Method page or in the repo.
- [ ] No copyrighted music. No third-party logos beyond Elexon data attribution.
- [ ] Upload as **Unlisted** to YouTube. Add chapters from the storyboard if useful.
- [ ] Copy the YouTube URL into the submission form and README.
- [ ] Test both URLs in an incognito window before submitting.
