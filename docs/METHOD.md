# Windwise method note

Version 1.0 · January 2026 snapshot · Last updated 24 October 2026

This note describes exactly how Windwise turns Elexon wind data into a gate-timed procurement
brief. It is written to be checked, not admired. The code that implements it is
[`backend/app/analytics.py`](../backend/app/analytics.py); the tests that constrain it are in
[`backend/tests/`](../backend/tests/).

## 1. Design rules

Four rules drive every calculation:

1. **A decision may only use information available before gate closure.** A forecast snapshot is
   eligible only if its `publishTime` is strictly earlier than the gate.
2. **Calibration for delivery day D uses complete delivery days at or before D-2.** Never D-1. This
   leaves a full day between the newest outcome used and the day being priced.
3. **Bands are empirical and out-of-sample.** They come from leave-one-day-out residuals, not from
   in-sample fitting.
4. **Raw and calibrated accuracy are always reported separately.** Calibration is not allowed to
   erase the raw forecast's failure.

The application also refuses to invent data. Missing snapshots are flagged, not smoothed. Actuals
that are incomplete are shown as incomplete. There is no price, demand, or weather model.

## 2. Data

### 2.1 Sources

| Dataset | Use | Filter |
| --- | --- | --- |
| Elexon `FUELHH` | Half-hourly actual wind outturn | `fuelType=WIND` |
| Elexon `WINDFOR` | National wind forecast snapshots | none |

Both are public BMRS datasets. The snapshot was built from the live API on 23 October 2026 and
committed as `backend/app/data/windwise.sqlite`.

### 2.2 Snapshot contents

| Item | Value |
| --- | ---: |
| Delivery window | 1–31 January 2026 |
| Actual half-hours | 1,488 |
| Delivery days | 31 |
| Forecast rows | 18,688 |
| Forecast snapshots | 256 |
| Actual range | 1,695–17,805 MW |
| Forecast range | 2,250–21,353 MW |
| SQLite size | 2,568,192 bytes |
| SHA-256 | `b992913db1eb2af9eb192412719fb3a2e5ea13904671a5594fa976f51a1079c4` |

The database is opened read-only. At boot, `data_store.py` recomputes the SHA-256 and compares it
with `manifest.json`. `/api/v1/health` reports `checksum_verified` and a `status` of `ok` or
`degraded`. The manifest also records source endpoints, counts, ranges, and per-gate coverage.

### 2.3 Time handling

All timestamps are UTC. January is GMT in the UK, so there is no local-time offset to apply in this
month. `WINDFOR` half-hours are averaged into 24 hourly values per delivery day:

```text
forecast[h] = mean(WINDFOR[t] for t in the two half-hours of hour h)
actual[h]   = mean(FUELHH[t]   for t in the two half-hours of hour h)
```

No interpolation is performed. A missing half-hour makes the hourly value unavailable rather than
silently zero.

## 3. Market gates

A day-ahead gate closes on the calendar day before delivery. Windwise models three gates:

| Gate ID | Market | Closure | Expected snapshot | Product |
| --- | --- | --- | --- | --- |
| `n2ex` | N2EX Day-Ahead | 09:50 | 09:30 | Hourly day-ahead auction |
| `epex` | EPEX GB Day-Ahead | 09:20 | 07:30 | Hourly day-ahead auction |
| `epex_hh` | EPEX GB Half-Hourly | 15:30 | 11:30 | Half-hourly day-ahead auction |

For delivery day D, the cutoff is `D-1` at the closure time in UTC. The selected forecast is the
latest publication **strictly before** that cutoff that also has full 24-hour coverage for D. If
the latest publication is incomplete, the next earlier complete one is used and the desk flags a
fallback. If the publication is not the expected scheduled snapshot, it is flagged separately.

Only one case in January requires a fallback: the 16 January EPEX GB half-hourly gate. The scheduled
11:30 snapshot is missing; the 12:25 unscheduled publication is used. The Snapshots view and the
desk both disclose this. No other gate/day combination lacks a complete pre-gate snapshot.

## 4. Calibration

### 4.1 One parameter

For delivery day D and gate g, let H be the set of complete delivery days at or before D-2 with at
least seven days available. The ratio is:

```text
k(D, g) = Σ_{d∈H} Σ_{h=0..23} actual[d,h]
          ─────────────────────────────────
          Σ_{d∈H} Σ_{h=0..23} forecast[d,h,g]
```

The calibrated expectation for each hour is:

```text
calibrated[h] = k × forecast[h]
```

There is no intercept, no wind-level slope, no time-of-day term, and no separate model per gate.
One parameter is deliberate: it is auditable, it removes the dominant bias, and it leaves a
residual distribution that can be tested. A flexible model fitted to 552 out-of-sample hours would
fit noise and conceal its own uncertainty.

### 4.2 Timing and provisional days

`MIN_CALIBRATION_DAYS = 7`. On 1–8 January there are fewer than seven complete days at or before
D-2, so the desk is **provisional**: no calibrated value, band, firm wind, or cover is shown. On
9 January, seven days are available and calibration unlocks. The window then expands by one day at a
time.

On 31 January, `k ≈ 0.861` from 29 complete days (1–29 January), or 696 hourly pairs. The calibrated
evaluation sample is the 23 delivery days from 9–31 January, or 552 hours.

### 4.3 Why D-2, not D-1

A buyer pricing 31 January should not assume that 30 January's outturn is already known and
settled at the gate. Requiring complete days at or before D-2 is conservative and makes the
walk-forward claim easier to defend. It also gives the calibration a one-day buffer against late
publication.

## 5. Empirical bands and firm wind

### 5.1 Leave-one-day-out residuals

Using in-sample residuals would make the bands too narrow. For each historical day j in H, Windwise
recomputes the ratio without day j:

```text
k_without_j = (Σ_H actual − Σ_j actual) / (Σ_H forecast − Σ_j forecast)
residual[j,h] = actual[j,h] − k_without_j × forecast[j,h]
```

Every historical hour is therefore scored with a coefficient that never saw its own day. The pooled
residuals form the empirical distribution used for the bands.

### 5.2 Quantiles

`quantile()` uses linear interpolation between order statistics. The stored quantiles are P2.5, P5,
P10, P20, P50, P80, P90, P95, P97.5, plus the minimum and maximum.

| Band | Rule | Nominal coverage |
| --- | --- | --- |
| Central 80% | `calibrated + P10` to `calibrated + P90` | 80% two-sided |
| Central 95% | `calibrated + P2.5` to `calibrated + P97.5` | 95% two-sided |
| 80% firm wind | `max(0, calibrated + P20)` | 80% one-sided |
| 90% firm wind | `max(0, calibrated + P10)` | 90% one-sided |
| Stress | `max(0, calibrated + min residual)` | all observed history |

Firm wind is floored at zero because negative wind is not a useful procurement floor.

### 5.3 Realised coverage

Nominal labels are not guarantees. On the 552 calibrated hours:

| Level | Realised | Average width |
| --- | ---: | ---: |
| Central 80% | **80.6%** | 4,286 MW |
| Central 95% | **90.6%** | 6,496 MW |
| 80% firm (P20) | **85.1%** | — |
| 90% firm (P10) | **88.9%** | — |
| Stress (min) | **97.3%** | — |

The central bands are close to nominal; the tail levels are not. The stress case is an observed
minimum, not a worst-case bound. January's failures are concentrated in high-wind hours, and the
28 January event broke every band.

## 6. Cover arithmetic

Let `s` be the client's share of national wind, as a fraction, and `F` the raw forecast for the
hour. Let `W_tier` be the firm-wind floor for the chosen tier. Then:

```text
cover[h] = max(0, min(s × F[h], s × max(0, F[h] − W_tier[h])))
        = max(0, s × max(0, F[h] − W_tier[h]))     because W_tier ≥ 0
```

The cap at `s × F[h]` prevents cover from exceeding the client's planned wind contribution. MWh is
the sum of the 24 hourly MW values; because each interval is one hour, MW and MWh are numerically
equal for the daily total.

The three tiers are:

| UI label | Firm wind | Meaning |
| --- | --- | --- |
| 80% confidence | P20 residual | Firm in roughly four delivery days out of five, historically |
| 90% confidence | P10 residual | The planning tier: firm roughly nine hours in ten, historically |
| Stress case | Minimum residual | The worst calibrated residual observed in the history window |

This is a **thermal-capacity proxy**, not a trade. It says how many MW of backup capacity the
client's wind shortfall could require. It does not model prices, orders, or counterparties.

## 7. Accuracy metrics

For each hour with both forecast and actual:

```text
error      = forecast − actual          (positive = over-forecast)
bias       = mean(error)
MAE        = mean(|error|)
RMSE       = sqrt(mean(error²))
MAPE       = mean(|error| / actual) × 100
shortfall  = max(0, forecast − actual)
```

The dashboard reports raw and calibrated versions separately. It also reports over-forecast counts,
mean/P90/max shortfall, correlation, and error quantiles. MAPE is omitted where actual is zero; this
does not occur in the January wind series.

### 7.1 Gate comparison

The same 744 hours are scored under each gate's selected snapshot:

| Gate | MAE |
| --- | ---: |
| N2EX 09:50 | 2,123 MW |
| EPEX GB 09:20 | 2,142 MW |
| EPEX GB HH 15:30 | 2,021 MW |

The differences are small relative to the forecast error. A later gate is not a free lunch.

### 7.2 Horizon skill

Every forecast vintage is pooled by lead time to the target hour, in six-hour buckets from 0–72
hours. This is descriptive, not independent: the same target hour appears in multiple vintages. It
shows how error grows with horizon, not a causal effect of waiting.

### 7.3 Revisions

For each selected snapshot, the previous complete pre-gate snapshot is compared hour by hour. The
dashboard reports mean absolute change, maximum absolute change, mean signed change, and the number
of hours revised by more than 500 MW. Across 13,543 comparable changes: mean absolute 333 MW, P90
801 MW, maximum 4,456 MW.

## 8. No-look-ahead guarantees

The tests in `backend/tests/` enforce:

- No selected snapshot is published at or after gate closure.
- Calibration history never includes D-1 or D.
- Calibration is unavailable before seven complete days.
- Bands use LODO residuals, not in-sample residuals.
- Raw and calibrated metrics are both present and separately labelled.
- Cover is zero when firm wind exceeds forecast and never exceeds the client's planned wind.
- CSV exports match the API payloads.
- Invalid dates and gates return 422.

The no-look-ahead tests mutate the data or clock to prove that a future observation cannot enter a
decision. They are not just smoke tests.

## 9. What the method does not claim

- It does not claim that January 2026 is representative of the year.
- It does not claim that a single ratio is the best possible calibration.
- It does not claim that nominal 80% or 95% bands are guaranteed.
- It does not claim that the stress case bounds the worst possible outcome.
- It does not claim that cover is an optimal hedge or a traded position.
- It does not use live data; the snapshot is fixed and reproducible.

The honest summary is: calibration removed most of the bias and about 40% of the MAE. The remaining
error is large, skewed, and operationally relevant. Windwise is designed to show that, not to hide
it.

## 10. Reproducing the numbers

```bash
# Backend tests
python -m pytest backend/tests -q

# Health and metadata
curl http://localhost:8000/api/v1/health
curl http://localhost:8000/api/v1/meta

# The 31 January desk at a 10% share
curl "http://localhost:8000/api/v1/desk?date=2026-01-31&gate=n2ex&share=10"

# The accuracy ledger
curl "http://localhost:8000/api/v1/accuracy?gate=n2ex"
```

The snapshot builder lives in `backend/scripts/`; it is not required to run the app. The committed
database is the source of truth for every displayed number.
