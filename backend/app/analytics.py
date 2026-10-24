"""Windwise analytics: gate selection, hourly matching, accuracy, calibration.

Design rules that the tests enforce:
  * A decision may only use a WINDFOR snapshot published *before* gate closure.
  * Calibration for delivery day D uses complete delivery days <= D-2, never D-1.
  * Bands are empirical quantiles of out-of-sample (leave-one-day-out) residuals.
  * Raw and calibrated accuracy are always reported separately.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Sequence

from .data_store import DELIVERY_END, DELIVERY_START, WindData

UTC = timezone.utc
MIN_CALIBRATION_DAYS = 7


@dataclass(frozen=True)
class Gate:
    id: str
    label: str
    short_label: str
    market: str
    closure: time
    closure_label: str
    expected_snapshot: str
    product: str


GATES: dict[str, Gate] = {
    "n2ex": Gate(
        id="n2ex",
        label="N2EX Day-Ahead",
        short_label="N2EX 09:50",
        market="N2EX",
        closure=time(9, 50),
        closure_label="09:50",
        expected_snapshot="09:30",
        product="Hourly day-ahead auction",
    ),
    "epex": Gate(
        id="epex",
        label="EPEX GB Day-Ahead",
        short_label="EPEX 09:20",
        market="EPEX GB",
        closure=time(9, 20),
        closure_label="09:20",
        expected_snapshot="07:30",
        product="Hourly day-ahead auction",
    ),
    "epex_hh": Gate(
        id="epex_hh",
        label="EPEX GB Half-Hourly",
        short_label="EPEX HH 15:30",
        market="EPEX GB HH",
        closure=time(15, 30),
        closure_label="15:30",
        expected_snapshot="11:30",
        product="Half-hourly day-ahead auction",
    ),
}

DEFAULT_GATE = "n2ex"


@dataclass(frozen=True)
class HourPair:
    day: date
    hour: int
    forecast: float
    actual: float
    snapshot: str


@dataclass(frozen=True)
class SnapshotChoice:
    publish_time: str
    latest_available: str | None
    used_fallback: bool
    expected_missing: bool


@dataclass(frozen=True)
class Calibration:
    available: bool
    k: float | None
    days_used: int
    hours_used: int
    history_from: str | None
    history_to: str | None
    reason: str | None
    q: dict[str, float | None]

    @property
    def band80_width_mw(self) -> float | None:
        low, high = self.q.get("p10"), self.q.get("p90")
        if low is None or high is None:
            return None
        return high - low


def _r(value: float | None, digits: int = 1) -> float | None:
    if value is None:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return round(float(value), digits)


def quantile(values: Sequence[float], probability: float) -> float | None:
    """Linear-interpolated empirical quantile."""
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = probability * (len(ordered) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def pearson(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    if len(xs) < 3 or len(xs) != len(ys):
        return None
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    var_x = sum((x - mean_x) ** 2 for x in xs)
    var_y = sum((y - mean_y) ** 2 for y in ys)
    if var_x <= 0 or var_y <= 0:
        return None
    return cov / math.sqrt(var_x * var_y)


def metrics_from_predictions(predictions: Iterable[tuple[float, float]]) -> dict:
    """Accuracy metrics for (predicted, actual) pairs.

    Signed error is prediction - actual: positive means over-forecast wind,
    which is the under-procurement direction for a buyer.
    """
    rows = [(float(predicted), float(actual)) for predicted, actual in predictions]
    n = len(rows)
    if n == 0:
        return {
            "n": 0,
            "bias_mw": None,
            "mae_mw": None,
            "rmse_mw": None,
            "mape_pct": None,
            "correlation": None,
            "p10_error_mw": None,
            "p50_error_mw": None,
            "p90_error_mw": None,
            "p90_abs_error_mw": None,
            "overforecast_hours": 0,
            "overforecast_share_pct": None,
            "mean_shortfall_mw": None,
            "p90_shortfall_mw": None,
            "max_shortfall_mw": None,
        }
    errors = [predicted - actual for predicted, actual in rows]
    absolute = [abs(error) for error in errors]
    shortfalls = [max(0.0, error) for error in errors]
    mape_terms = [abs(error) / actual * 100 for error, (_, actual) in zip(errors, rows) if actual > 0]
    return {
        "n": n,
        "bias_mw": _r(sum(errors) / n),
        "mae_mw": _r(sum(absolute) / n),
        "rmse_mw": _r(math.sqrt(sum(error * error for error in errors) / n)),
        "mape_pct": _r(sum(mape_terms) / len(mape_terms)) if mape_terms else None,
        "correlation": _r(pearson([p for p, _ in rows], [a for _, a in rows]), 3),
        "p10_error_mw": _r(quantile(errors, 0.10), 0),
        "p50_error_mw": _r(quantile(errors, 0.50), 0),
        "p90_error_mw": _r(quantile(errors, 0.90), 0),
        "p90_abs_error_mw": _r(quantile(absolute, 0.90), 0),
        "overforecast_hours": sum(1 for error in errors if error > 0),
        "overforecast_share_pct": _r(sum(1 for error in errors if error > 0) / n * 100),
        "mean_shortfall_mw": _r(sum(shortfalls) / n),
        "p90_shortfall_mw": _r(quantile(shortfalls, 0.90), 0),
        "max_shortfall_mw": _r(max(shortfalls), 0),
    }


def error_metrics(pairs: Sequence[HourPair], k: float | None = None) -> dict:
    return metrics_from_predictions(
        (pair.forecast if k is None else k * pair.forecast, pair.actual) for pair in pairs
    )


def _gate_cutoff(day: date, gate: Gate) -> datetime:
    return datetime.combine(day - timedelta(days=1), gate.closure, tzinfo=UTC)


def _timestamp(day: date, hour: int) -> str:
    return f"{day.isoformat()}T{hour:02d}:00:00Z"


def _parse(timestamp: str) -> datetime:
    return datetime.fromisoformat(timestamp.replace("Z", "+00:00"))


class Analytics:
    def __init__(self, data: WindData):
        self.data = data
        self._pairs_cache: dict[tuple[str, str], list[HourPair]] = {}
        self._calibration_cache: dict[tuple[str, str], Calibration] = {}
        self._snapshot_cache: dict[tuple[str, str], SnapshotChoice | None] = {}
        self._revision_stats: dict | None = None
        self._horizon_stats: dict | None = None
        self._gate_metrics: dict | None = None
        self._reliability_cache: dict[str, dict] = {}

    # ------------------------------------------------------------------ gates
    def snapshot_for(self, day: date, gate_id: str) -> SnapshotChoice | None:
        cache_key = (day.isoformat(), gate_id)
        if cache_key in self._snapshot_cache:
            return self._snapshot_cache[cache_key]

        gate = GATES[gate_id]
        cutoff = _gate_cutoff(day, gate)
        cutoff_text = cutoff.strftime("%Y-%m-%dT%H:%M:%SZ")
        before = sorted(
            (publish for publish in self.data.forecasts if publish < cutoff_text),
            reverse=True,
        )
        latest_available = before[0] if before else None
        chosen = next(
            (publish for publish in before if self.data.snapshot_coverage(publish, day) == 24),
            None,
        )
        if chosen is None:
            self._snapshot_cache[cache_key] = None
            return None

        expected_publish = f"{day - timedelta(days=1)}T{gate.expected_snapshot}:00Z"
        choice = SnapshotChoice(
            publish_time=chosen,
            latest_available=latest_available,
            used_fallback=chosen != latest_available,
            expected_missing=chosen != expected_publish,
        )
        self._snapshot_cache[cache_key] = choice
        return choice

    # -------------------------------------------------------- hourly matching
    def pairs(self, day: date, gate_id: str) -> list[HourPair]:
        cache_key = (day.isoformat(), gate_id)
        cached = self._pairs_cache.get(cache_key)
        if cached is not None:
            return cached

        choice = self.snapshot_for(day, gate_id)
        if choice is None:
            self._pairs_cache[cache_key] = []
            return []

        snapshot = self.data.forecasts[choice.publish_time]
        actuals = self.data.hourly_actuals(day)
        result = []
        for hour in range(24):
            forecast = snapshot.get(_timestamp(day, hour))
            actual = actuals.get(hour)
            if forecast is not None and actual is not None:
                result.append(
                    HourPair(
                        day=day,
                        hour=hour,
                        forecast=forecast,
                        actual=actual,
                        snapshot=choice.publish_time,
                    )
                )
        self._pairs_cache[cache_key] = result
        return result

    # ------------------------------------------------------- calibration (k)
    def calibration(self, day: date, gate_id: str) -> Calibration:
        cache_key = (day.isoformat(), gate_id)
        cached = self._calibration_cache.get(cache_key)
        if cached is not None:
            return cached

        history_days: list[date] = []
        history_pairs: list[list[HourPair]] = []
        for candidate in self.data.delivery_days():
            if candidate > day - timedelta(days=2):
                break
            candidate_pairs = self.pairs(candidate, gate_id)
            if len(candidate_pairs) != 24:
                continue
            history_days.append(candidate)
            history_pairs.append(candidate_pairs)

        if len(history_days) < MIN_CALIBRATION_DAYS:
            calibration = Calibration(
                available=False,
                k=None,
                days_used=len(history_days),
                hours_used=len(history_days) * 24,
                history_from=history_days[0].isoformat() if history_days else None,
                history_to=history_days[-1].isoformat() if history_days else None,
                reason=(
                    f"{len(history_days)} of {MIN_CALIBRATION_DAYS} complete delivery days available. "
                    f"Calibration unlocks on 9 Jan 2026."
                ),
                q={},
            )
            self._calibration_cache[cache_key] = calibration
            return calibration

        total_forecast = sum(pair.forecast for pairs in history_pairs for pair in pairs)
        total_actual = sum(pair.actual for pairs in history_pairs for pair in pairs)
        k = total_actual / total_forecast if total_forecast > 0 else 1.0

        # Leave-one-day-out residuals: each historical hour is scored with a
        # coefficient estimated without its own delivery day. This keeps the
        # band from being artificially narrowed by in-sample fitting.
        residuals: list[float] = []
        for pairs in history_pairs:
            day_forecast = sum(pair.forecast for pair in pairs)
            day_actual = sum(pair.actual for pair in pairs)
            denominator = total_forecast - day_forecast
            k_without_day = (total_actual - day_actual) / denominator if denominator > 0 else k
            residuals.extend(pair.actual - k_without_day * pair.forecast for pair in pairs)

        q = {
            "p025": quantile(residuals, 0.025),
            "p05": quantile(residuals, 0.05),
            "p10": quantile(residuals, 0.10),
            "p20": quantile(residuals, 0.20),
            "p50": quantile(residuals, 0.50),
            "p80": quantile(residuals, 0.80),
            "p90": quantile(residuals, 0.90),
            "p95": quantile(residuals, 0.95),
            "p975": quantile(residuals, 0.975),
            "min": min(residuals),
            "max": max(residuals),
        }
        calibration = Calibration(
            available=True,
            k=k,
            days_used=len(history_days),
            hours_used=len(history_days) * 24,
            history_from=history_days[0].isoformat(),
            history_to=history_days[-1].isoformat(),
            reason=None,
            q=q,
        )
        self._calibration_cache[cache_key] = calibration
        return calibration

    # ------------------------------------------------------------- desk view
    def desk(self, day: date, gate_id: str, share_pct: float = 10.0) -> dict:
        gate = GATES[gate_id]
        choice = self.snapshot_for(day, gate_id)
        if choice is None:
            raise ValueError(f"No snapshot with full coverage for {day} at {gate_id}")

        cutoff = _gate_cutoff(day, gate)
        snapshot = self.data.forecasts[choice.publish_time]
        actuals = self.data.hourly_actuals(day)
        calibration = self.calibration(day, gate_id)
        share = max(0.0, min(100.0, share_pct)) / 100.0

        cover_keys = ("p80", "p90", "stress")
        quantile_for_cover = {
            "p80": calibration.q.get("p20"),
            "p90": calibration.q.get("p10"),
            "stress": calibration.q.get("min"),
        }

        hourly: list[dict] = []
        for hour in range(24):
            forecast = snapshot.get(_timestamp(day, hour))
            actual = actuals.get(hour)
            calibrated = None
            bands: dict[str, float | None] = {
                "band80_low_mw": None,
                "band80_high_mw": None,
                "band95_low_mw": None,
                "band95_high_mw": None,
            }
            firm: dict[str, float | None] = {key: None for key in cover_keys}
            cover: dict[str, float | None] = {key: None for key in cover_keys}
            if forecast is not None and calibration.available and calibration.k is not None:
                calibrated = calibration.k * forecast
                bands = {
                    "band80_low_mw": calibrated + calibration.q["p10"],
                    "band80_high_mw": calibrated + calibration.q["p90"],
                    "band95_low_mw": calibrated + calibration.q["p025"],
                    "band95_high_mw": calibrated + calibration.q["p975"],
                }
                for key in cover_keys:
                    quantile = quantile_for_cover[key]
                    if quantile is not None:
                        # Firm wind cannot be negative; neither can cover exceed
                        # the client's planned wind contribution.
                        firm[key] = max(0.0, calibrated + quantile)
                        cover[key] = max(0.0, min(share * forecast, share * (forecast - firm[key])))

            hourly.append(
                {
                    "hour": hour,
                    "label": f"{hour:02d}:00",
                    "forecast_mw": _r(forecast, 0) if forecast is not None else None,
                    "calibrated_mw": _r(calibrated, 0),
                    **{key: (_r(value, 0) if value is not None else None) for key, value in bands.items()},
                    "firm_mw": {key: (_r(value, 0) if value is not None else None) for key, value in firm.items()},
                    "forecast_share_mw": _r(share * forecast, 0) if forecast is not None else None,
                    "cover_mw": {key: (_r(value, 0) if value is not None else None) for key, value in cover.items()},
                    "actual_mw": _r(actual, 0) if actual is not None else None,
                    "error_mw": _r(forecast - actual, 0) if forecast is not None and actual is not None else None,
                    "calibrated_error_mw": (
                        _r(calibrated - actual, 0)
                        if calibrated is not None and actual is not None
                        else None
                    ),
                    "shortfall_mw": (
                        _r(max(0.0, forecast - actual), 0)
                        if forecast is not None and actual is not None
                        else None
                    ),
                }
            )

        forecast_values = [row["forecast_mw"] for row in hourly if row["forecast_mw"] is not None]
        calibrated_values = [row["calibrated_mw"] for row in hourly if row["calibrated_mw"] is not None]
        peak_row = max(hourly, key=lambda row: row["forecast_mw"] or 0)
        band_widths = [
            row["band80_high_mw"] - row["band80_low_mw"]
            for row in hourly
            if row["band80_low_mw"] is not None and row["band80_high_mw"] is not None
        ]

        cover_summary = {}
        for key in cover_keys:
            observed = [
                (row["hour"], row["cover_mw"][key])
                for row in hourly
                if row["cover_mw"][key] is not None
            ]
            if observed:
                values = [value for _, value in observed]
                peak_hour, peak_value = max(observed, key=lambda item: item[1])
                cover_summary[key] = {
                    "peak_mw": _r(peak_value, 0),
                    "peak_hour": peak_hour,
                    "average_mw": _r(sum(values) / len(values), 0),
                    "mwh": _r(sum(values), 0),
                    "hours_positive": sum(1 for value in values if value > 0),
                }
            else:
                cover_summary[key] = None

        pairs = self.pairs(day, gate_id)
        raw_metrics = error_metrics(pairs)
        calibrated_metrics = error_metrics(pairs, calibration.k) if calibration.available else None

        outturn = None
        if len(pairs) == 24:
            hits_80 = 0
            hits_95_band = 0
            hits_90_one_sided = 0
            hits_stress = 0
            if calibration.available and calibration.k is not None:
                for pair in pairs:
                    calibrated = calibration.k * pair.forecast
                    residual = pair.actual - calibrated
                    if calibration.q["p10"] <= residual <= calibration.q["p90"]:
                        hits_80 += 1
                    if calibration.q["p025"] <= residual <= calibration.q["p975"]:
                        hits_95_band += 1
                    if residual >= calibration.q["p10"]:
                        hits_90_one_sided += 1
                    if residual >= calibration.q["min"]:
                        hits_stress += 1
            worst = max(pairs, key=lambda pair: pair.forecast - pair.actual)
            outturn = {
                "available": True,
                "raw": raw_metrics,
                "calibrated": calibrated_metrics,
                "hours_in_band_80": hits_80,
                "hours_in_band_95": hits_95_band,
                "hours_above_firm_90": hits_90_one_sided,
                "hours_above_stress": hits_stress,
                "worst_hour": worst.hour,
                "worst_error_mw": _r(worst.forecast - worst.actual, 0),
                "mean_actual_mw": _r(sum(pair.actual for pair in pairs) / len(pairs), 0),
            }
        else:
            outturn = {"available": False, "reason": "Actuals are incomplete for this delivery day."}

        revision = self._revision_for(day, gate, choice)

        data_quality = {
            "snapshot_publish_time": choice.publish_time,
            "latest_available_snapshot": choice.latest_available,
            "used_fallback": choice.used_fallback,
            "expected_snapshot_missing": choice.expected_missing,
            "expected_snapshot_time": f"{day - timedelta(days=1)}T{gate.expected_snapshot}:00Z",
            "note": self._quality_note(choice, gate),
            "actual_hours_available": len(actuals),
            "forecast_hours_available": self.data.snapshot_coverage(choice.publish_time, day),
        }

        return {
            "delivery_date": day.isoformat(),
            "gate": self._gate_payload(gate, day, choice),
            "status": "calibrated" if calibration.available else "provisional",
            "status_label": "Calibrated brief" if calibration.available else "Provisional brief",
            "status_detail": (
                f"k = {calibration.k:.3f} from {calibration.days_used} complete delivery days "
                f"({calibration.history_from} to {calibration.history_to}), all <= D-2."
                if calibration.available
                else calibration.reason
            ),
            "calibration": self._calibration_payload(calibration),
            "share_pct": _r(share_pct, 1),
            "national": {
                "forecast_average_mw": _r(sum(forecast_values) / len(forecast_values), 0),
                "forecast_peak_mw": _r(max(forecast_values), 0),
                "forecast_peak_hour": peak_row["hour"],
                "forecast_mwh": _r(sum(forecast_values), 0),
                "calibrated_average_mw": (
                    _r(sum(calibrated_values) / len(calibrated_values), 0) if calibrated_values else None
                ),
                "calibrated_peak_mw": _r(max(calibrated_values), 0) if calibrated_values else None,
                "calibration_delta_mw": (
                    _r(sum(calibrated_values) / len(calibrated_values) - sum(forecast_values) / len(forecast_values), 0)
                    if calibrated_values
                    else None
                ),
                "firm_90_average_mw": (
                    _r(
                        sum(row["firm_mw"]["p90"] for row in hourly if row["firm_mw"]["p90"] is not None)
                        / max(1, sum(1 for row in hourly if row["firm_mw"]["p90"] is not None)),
                        0,
                    )
                    if calibration.available
                    else None
                ),
                "band80_average_width_mw": _r(sum(band_widths) / len(band_widths), 0) if band_widths else None,
                "hours": 24,
            },
            "reliability": self.reliability(gate_id),
            "cover": {
                "share_pct": _r(share_pct, 1),
                "confidence": cover_summary,
                "definition": (
                    "Thermal capacity to hold against a wind shortfall, relative to planning on the raw "
                    "Elexon national forecast. Firm wind is floored at zero and cover cannot exceed the "
                    "client's planned wind contribution."
                ),
            },
            "hourly": hourly,
            "revision": revision,
            "outturn": outturn,
            "raw_metrics": raw_metrics,
            "calibrated_metrics": calibrated_metrics,
            "data_quality": data_quality,
        }

    def reliability(self, gate_id: str) -> dict:
        """Observed one-sided firm-wind coverage over the calibrated period."""
        cached = self._reliability_cache.get(gate_id)
        if cached is not None:
            return cached
        hits = {"p80": 0, "p90": 0, "stress": 0}
        total = 0
        for day in self.data.delivery_days():
            calibration = self.calibration(day, gate_id)
            if not calibration.available or calibration.k is None:
                continue
            for pair in self.pairs(day, gate_id):
                residual = pair.actual - calibration.k * pair.forecast
                total += 1
                if residual >= calibration.q["p20"]:
                    hits["p80"] += 1
                if residual >= calibration.q["p10"]:
                    hits["p90"] += 1
                if residual >= calibration.q["min"]:
                    hits["stress"] += 1
        result = {
            "n": total,
            "levels": {
                key: {
                    "hits": value,
                    "empirical_pct": _r(value / total * 100) if total else None,
                }
                for key, value in hits.items()
            },
            "note": "One-sided firm-wind coverage measured over calibrated delivery days.",
        }
        self._reliability_cache[gate_id] = result
        return result

    def _gate_payload(self, gate: Gate, day: date, choice: SnapshotChoice) -> dict:
        cutoff = _gate_cutoff(day, gate)
        publish = _parse(choice.publish_time)
        return {
            "id": gate.id,
            "label": gate.label,
            "short_label": gate.short_label,
            "market": gate.market,
            "closure_label": gate.closure_label,
            "closure_utc": cutoff.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "product": gate.product,
            "timezone": "Europe/London (GMT in January)",
            "snapshot_time": choice.publish_time,
            "minutes_before_gate": int((cutoff - publish).total_seconds() // 60),
            "decision_day": (day - timedelta(days=1)).isoformat(),
        }

    def _quality_note(self, choice: SnapshotChoice, gate: Gate) -> str | None:
        if choice.used_fallback:
            return (
                f"The latest available snapshot ({choice.latest_available}) lacked full 24-hour coverage; "
                f"using {choice.publish_time} instead."
            )
        if choice.expected_missing:
            return (
                f"The scheduled {gate.expected_snapshot} snapshot was not available; using "
                f"{choice.publish_time}. This is flagged, not silently smoothed."
            )
        return None

    def _calibration_payload(self, calibration: Calibration) -> dict:
        return {
            "available": calibration.available,
            "k": _r(calibration.k, 4),
            "days_used": calibration.days_used,
            "hours_used": calibration.hours_used,
            "days_required": MIN_CALIBRATION_DAYS,
            "history_from": calibration.history_from,
            "history_to": calibration.history_to,
            "rule": "k = sum(actual) / sum(forecast) over complete delivery days <= D-2; expanding window.",
            "residuals": {
                key: (_r(value, 0) if value is not None else None) for key, value in calibration.q.items()
            },
            "band80_width_mw": _r(calibration.band80_width_mw, 0),
            "method": "Leave-one-day-out calibrated residuals, empirical quantiles.",
        }

    def _revision_for(self, day: date, gate: Gate, choice: SnapshotChoice) -> dict | None:
        cutoff_text = _gate_cutoff(day, gate).strftime("%Y-%m-%dT%H:%M:%SZ")
        full = [
            publish
            for publish in sorted(self.data.forecasts)
            if publish < cutoff_text and self.data.snapshot_coverage(publish, day) == 24
        ]
        if len(full) < 2 or choice.publish_time not in full:
            return None
        index = full.index(choice.publish_time)
        previous = full[index - 1] if index > 0 else None
        if previous is None:
            return None
        current_values = self.data.forecasts[choice.publish_time]
        previous_values = self.data.forecasts[previous]
        deltas = [
            current_values[_timestamp(day, hour)] - previous_values[_timestamp(day, hour)]
            for hour in range(24)
        ]
        return {
            "previous_snapshot": previous,
            "mean_abs_change_mw": _r(sum(abs(delta) for delta in deltas) / len(deltas), 0),
            "max_abs_change_mw": _r(max(abs(delta) for delta in deltas), 0),
            "mean_signed_change_mw": _r(sum(deltas) / len(deltas), 0),
            "hours_changed_over_500mw": sum(1 for delta in deltas if abs(delta) > 500),
        }

    # --------------------------------------------------------- accuracy view
    def accuracy(self, gate_id: str) -> dict:
        days = self.data.delivery_days()
        daily: list[dict] = []
        raw_predictions: list[tuple[float, float]] = []
        calibrated_predictions: list[tuple[float, float]] = []
        raw_pairs: list[HourPair] = []
        calibrated_rows: list[dict] = []
        heatmap: list[dict] = []
        scatter: list[dict] = []
        worst: list[dict] = []

        coverage = {
            "two_sided": [
                {"id": "80", "claimed_pct": 80.0, "hits": 0, "n": 0, "width_total": 0.0},
                {"id": "95", "claimed_pct": 95.0, "hits": 0, "n": 0, "width_total": 0.0},
            ],
            "one_sided": [
                {"id": "80", "claimed_pct": 80.0, "hits": 0, "n": 0},
                {"id": "90", "claimed_pct": 90.0, "hits": 0, "n": 0},
                {"id": "stress", "claimed_pct": None, "hits": 0, "n": 0},
            ],
        }

        for day in days:
            pairs = self.pairs(day, gate_id)
            calibration = self.calibration(day, gate_id)
            raw_pairs.extend(pairs)
            raw_predictions.extend((pair.forecast, pair.actual) for pair in pairs)
            raw_metrics = error_metrics(pairs)
            calibrated_metrics = error_metrics(pairs, calibration.k) if calibration.available else None
            band_hits = 0
            firm_hits = 0

            if calibration.available and calibration.k is not None:
                for pair in pairs:
                    calibrated = calibration.k * pair.forecast
                    calibrated_predictions.append((calibrated, pair.actual))
                    residual = pair.actual - calibrated
                    calibrated_rows.append(
                        {"date": day.isoformat(), "hour": pair.hour, "residual": residual}
                    )
                    if calibration.q["p10"] <= residual <= calibration.q["p90"]:
                        band_hits += 1
                    if residual >= calibration.q["p10"]:
                        firm_hits += 1
                    self._accumulate_coverage(coverage, calibration, residual)

            for pair in pairs:
                calibrated = calibration.k * pair.forecast if calibration.available and calibration.k is not None else None
                raw_error = pair.forecast - pair.actual
                heatmap.append(
                    {
                        "date": day.isoformat(),
                        "hour": pair.hour,
                        "raw_error_mw": _r(raw_error, 0),
                        "calibrated_error_mw": _r(calibrated - pair.actual, 0) if calibrated is not None else None,
                    }
                )
                scatter.append(
                    {
                        "date": day.isoformat(),
                        "hour": pair.hour,
                        "forecast_mw": _r(pair.forecast, 0),
                        "actual_mw": _r(pair.actual, 0),
                        "calibrated_mw": _r(calibrated, 0) if calibrated is not None else None,
                        "error_mw": _r(raw_error, 0),
                        "calibrated_error_mw": _r(calibrated - pair.actual, 0) if calibrated is not None else None,
                    }
                )
                worst.append(
                    {
                        "date": day.isoformat(),
                        "hour": pair.hour,
                        "forecast_mw": _r(pair.forecast, 0),
                        "actual_mw": _r(pair.actual, 0),
                        "error_mw": _r(raw_error, 0),
                        "calibrated_error_mw": _r(calibrated - pair.actual, 0) if calibrated is not None else None,
                    }
                )

            daily.append(
                {
                    "date": day.isoformat(),
                    "status": "calibrated" if calibration.available else "provisional",
                    "k": _r(calibration.k, 3),
                    "n": len(pairs),
                    "raw": raw_metrics,
                    "calibrated": calibrated_metrics,
                    "band80_hits": band_hits if calibration.available else None,
                    "band80_n": len(pairs) if calibration.available else None,
                    "firm90_hits": firm_hits if calibration.available else None,
                }
            )

        worst.sort(key=lambda row: -abs(row["error_mw"]))
        coverage_payload = {
            "two_sided": [
                {
                    "id": row["id"],
                    "claimed_pct": row["claimed_pct"],
                    "empirical_pct": _r(row["hits"] / row["n"] * 100) if row["n"] else None,
                    "hits": row["hits"],
                    "n": row["n"],
                    "average_width_mw": _r(row["width_total"] / row["n"], 0) if row["n"] else None,
                }
                for row in coverage["two_sided"]
            ],
            "one_sided": [
                {
                    "id": row["id"],
                    "claimed_pct": row["claimed_pct"],
                    "empirical_pct": _r(row["hits"] / row["n"] * 100) if row["n"] else None,
                    "hits": row["hits"],
                    "n": row["n"],
                }
                for row in coverage["one_sided"]
            ],
            "note": (
                "Empirical coverage is measured walk-forward. Two-sided bands answer 'where will wind land?'; "
                "one-sided coverage answers 'how often was actual wind at least this high?'. "
                "The nominal 95% central band realised 90.6% coverage: the tail is heavy in this sample, so "
                "the band is shown as context rather than sold as a guarantee. Stress is the worst calibrated "
                "residual observed so far."
            ),
        }

        raw_summary = metrics_from_predictions(raw_predictions)
        calibrated_summary = metrics_from_predictions(calibrated_predictions)

        level_edges = [0, 8000, 12000, 16000, 20000, 25000]
        calibrated_lookup = {
            (row["date"], row["hour"]): row["residual"] for row in calibrated_rows
        }
        levels = []
        for lower, upper in zip(level_edges, level_edges[1:]):
            subset = [
                pair
                for pair in raw_pairs
                if lower <= pair.forecast < upper
            ]
            if not subset:
                continue
            calibrated_residuals = [
                calibrated_lookup[(pair.day.isoformat(), pair.hour)]
                for pair in subset
                if (pair.day.isoformat(), pair.hour) in calibrated_lookup
            ]
            levels.append(
                {
                    "from_mw": lower,
                    "to_mw": upper,
                    "label": f"{lower / 1000:g}-{upper / 1000:g} GW",
                    "n": len(subset),
                    "bias_mw": _r(sum(pair.forecast - pair.actual for pair in subset) / len(subset), 0),
                    "mae_mw": _r(sum(abs(pair.forecast - pair.actual) for pair in subset) / len(subset), 0),
                    # Residual is actual - calibrated, so negate for the familiar
                    # forecast-minus-actual sign convention.
                    "calibrated_bias_mw": (
                        _r(-sum(calibrated_residuals) / len(calibrated_residuals), 0)
                        if calibrated_residuals
                        else None
                    ),
                    "calibrated_mae_mw": (
                        _r(sum(abs(residual) for residual in calibrated_residuals) / len(calibrated_residuals), 0)
                        if calibrated_residuals
                        else None
                    ),
                    "overforecast_share_pct": _r(
                        sum(1 for pair in subset if pair.forecast > pair.actual) / len(subset) * 100
                    ),
                }
            )

        histogram_start = -6500
        histogram_width = 500
        histogram_bins = []
        raw_counts = [0] * 28
        calibrated_counts = [0] * 28
        for pair in raw_pairs:
            index = int((pair.forecast - pair.actual - histogram_start) // histogram_width)
            index = max(0, min(27, index))
            raw_counts[index] += 1
        for residual_row in calibrated_rows:
            index = int((residual_row["residual"] - histogram_start) // histogram_width)
            index = max(0, min(27, index))
            calibrated_counts[index] += 1
        for index in range(28):
            histogram_bins.append(
                {
                    "from_mw": histogram_start + index * histogram_width,
                    "to_mw": histogram_start + (index + 1) * histogram_width,
                    "raw": raw_counts[index],
                    "calibrated": calibrated_counts[index],
                }
            )

        return {
            "gate": self._gate_static_payload(gate_id),
            "summary": {
                "raw": raw_summary,
                "calibrated": calibrated_summary,
                "provisional_days": sum(1 for row in daily if row["status"] == "provisional"),
                "calibrated_days": sum(1 for row in daily if row["status"] == "calibrated"),
            },
            "daily": daily,
            "scatter": scatter,
            "histogram": {
                "start_mw": histogram_start,
                "width_mw": histogram_width,
                "bins": histogram_bins,
            },
            "levels": levels,
            "heatmap": heatmap,
            "worst": worst[:10],
            "coverage": coverage_payload,
            "gates": self.gate_comparison(),
            "horizon": self.horizon_stats(),
            "revisions": self.revision_stats(),
            "method_notes": [
                "Forecast error = forecast - actual. Positive bias means over-forecast wind, which under-procures thermal cover.",
                "Actuals are the mean of the two half-hourly FUELHH settlement periods in each hour.",
                "Calibration uses complete delivery days <= D-2; D-1 actuals are never used.",
                "Bands are empirical leave-one-day-out residual quantiles and are not guarantees.",
            ],
        }

    def _accumulate_coverage(self, coverage: dict, calibration: Calibration, residual: float) -> None:
        q = calibration.q
        two_sided = coverage["two_sided"]
        two_sided[0]["n"] += 1
        two_sided[1]["n"] += 1
        two_sided[0]["width_total"] += q["p90"] - q["p10"]
        two_sided[1]["width_total"] += q["p975"] - q["p025"]
        if q["p10"] <= residual <= q["p90"]:
            two_sided[0]["hits"] += 1
        if q["p025"] <= residual <= q["p975"]:
            two_sided[1]["hits"] += 1

        one_sided = coverage["one_sided"]
        for row in one_sided:
            row["n"] += 1
        if residual >= q["p20"]:
            one_sided[0]["hits"] += 1
        if residual >= q["p10"]:
            one_sided[1]["hits"] += 1
        if residual >= q["min"]:
            one_sided[2]["hits"] += 1

    # -------------------------------------------------------- snapshots view
    def snapshots(self, day: date, gate_id: str) -> dict:
        gate = GATES[gate_id]
        cutoff_text = _gate_cutoff(day, gate).strftime("%Y-%m-%dT%H:%M:%SZ")
        choice = self.snapshot_for(day, gate_id)
        publishes = [
            publish
            for publish in sorted(self.data.forecasts)
            if self.data.snapshot_coverage(publish, day) == 24
        ]
        rows = []
        previous_publish = None
        for publish in publishes:
            values = [self.data.forecasts[publish][_timestamp(day, hour)] for hour in range(24)]
            revision_mean = None
            revision_max = None
            avg_signed = None
            if previous_publish is not None:
                deltas = [
                    values[hour] - self.data.forecasts[previous_publish][_timestamp(day, hour)]
                    for hour in range(24)
                ]
                revision_mean = sum(abs(delta) for delta in deltas) / len(deltas)
                revision_max = max(abs(delta) for delta in deltas)
                avg_signed = sum(deltas) / len(deltas)
            rows.append(
                {
                    "publish_time": publish,
                    "lead_hours_to_midnight": round((_parse(f"{day.isoformat()}T00:00:00Z") - _parse(publish)).total_seconds() / 3600, 1),
                    "average_mw": _r(sum(values) / len(values), 0),
                    "peak_mw": _r(max(values), 0),
                    "revision_mean_abs_mw": _r(revision_mean, 0),
                    "revision_max_abs_mw": _r(revision_max, 0),
                    "revision_mean_signed_mw": _r(avg_signed, 0),
                    "before_gate": publish < cutoff_text,
                    "selected": bool(choice and publish == choice.publish_time),
                    "is_latest_before_gate": bool(choice and publish == choice.latest_available),
                }
            )
            previous_publish = publish

        actuals = self.data.hourly_actuals(day)
        actual_series = [actuals.get(hour) for hour in range(24)]
        gate_rows = []
        for other_gate_id, other_gate in GATES.items():
            other_choice = self.snapshot_for(day, other_gate_id)
            gate_rows.append(
                {
                    **self._gate_static_payload(other_gate_id),
                    "snapshot_time": other_choice.publish_time if other_choice else None,
                    "used_fallback": other_choice.used_fallback if other_choice else None,
                    "minutes_before_gate": (
                        int((_gate_cutoff(day, other_gate) - _parse(other_choice.publish_time)).total_seconds() // 60)
                        if other_choice
                        else None
                    ),
                }
            )

        day_revisions = [row["revision_mean_abs_mw"] for row in rows if row["revision_mean_abs_mw"] is not None]
        selected_row = next((row for row in rows if row["selected"]), None)
        return {
            "delivery_date": day.isoformat(),
            "gate": self._gate_static_payload(gate_id),
            "selected_snapshot": choice.publish_time if choice else None,
            "selected_average_mw": selected_row["average_mw"] if selected_row else None,
            "selected_peak_mw": selected_row["peak_mw"] if selected_row else None,
            "snapshots": rows,
            "series": [
                {
                    "publish_time": row["publish_time"],
                    "values": [_r(self.data.forecasts[row["publish_time"]][_timestamp(day, hour)], 0) for hour in range(24)],
                    "selected": row["selected"],
                    "before_gate": row["before_gate"],
                }
                for row in rows
            ],
            "actual": [_r(value, 0) if value is not None else None for value in actual_series],
            "gates": gate_rows,
            "revision": {
                "day_mean_abs_mw": _r(sum(day_revisions) / len(day_revisions), 0) if day_revisions else None,
                "month": self.revision_stats(),
            },
            "horizon": self.horizon_stats(),
            "status_note": (
                "Showing snapshot revisions for this delivery day. The selected row is the latest "
                "full-coverage snapshot published before the chosen gate."
            ),
        }

    # ------------------------------------------------------------ month stats
    def revision_stats(self) -> dict:
        if self._revision_stats is not None:
            return self._revision_stats

        january = {day.isoformat() for day in self.data.delivery_days()}
        buckets: dict[int, list[float]] = defaultdict(list)
        all_changes: list[float] = []
        publishes = sorted(self.data.forecasts)
        for index in range(1, len(publishes)):
            previous = publishes[index - 1]
            current = publishes[index]
            gap_hours = (_parse(current) - _parse(previous)).total_seconds() / 3600
            if gap_hours <= 0 or gap_hours > 6:
                continue
            previous_values = self.data.forecasts[previous]
            current_values = self.data.forecasts[current]
            for target in set(previous_values) & set(current_values):
                if target[:10] not in january:
                    continue
                lead = (_parse(target) - _parse(current)).total_seconds() / 3600
                if not 0 <= lead <= 72:
                    continue
                change = abs(current_values[target] - previous_values[target])
                buckets[int(lead // 6) * 6].append(change)
                all_changes.append(change)
        if not all_changes:
            self._revision_stats = {"overall": None, "buckets": [], "histogram": []}
            return self._revision_stats

        histogram_edges = [0, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 99999]
        histogram = []
        for lower, upper in zip(histogram_edges, histogram_edges[1:]):
            count = sum(1 for change in all_changes if lower <= change < upper)
            histogram.append({"from_mw": lower, "to_mw": None if upper == 99999 else upper, "count": count})

        self._revision_stats = {
            "overall": {
                "n": len(all_changes),
                "mean_abs_mw": _r(sum(all_changes) / len(all_changes), 0),
                "p90_abs_mw": _r(quantile(all_changes, 0.90), 0),
                "max_abs_mw": _r(max(all_changes), 0),
            },
            "buckets": [
                {
                    "lead_hours": lead,
                    "n": len(values),
                    "mean_abs_mw": _r(sum(values) / len(values), 0),
                    "p90_abs_mw": _r(quantile(values, 0.90), 0),
                }
                for lead, values in sorted(buckets.items())
            ],
            "histogram": histogram,
            "note": "Absolute change between consecutive snapshots for the same target hour, leads 0-72h.",
        }
        return self._revision_stats

    def horizon_stats(self) -> dict:
        if self._horizon_stats is not None:
            return self._horizon_stats

        buckets: dict[int, list[float]] = defaultdict(list)
        for publish, snapshot in self.data.forecasts.items():
            publish_dt = _parse(publish)
            for target, forecast in snapshot.items():
                target_day = date.fromisoformat(target[:10])
                if not (DELIVERY_START <= target_day <= DELIVERY_END):
                    continue
                hour = int(target[11:13])
                actual = self.data.hourly_actuals(target_day).get(hour)
                if actual is None:
                    continue
                lead = (parse_time(target) - publish_dt).total_seconds() / 3600
                if 0 <= lead < 72:
                    buckets[int(lead // 6) * 6].append(forecast - actual)
        self._horizon_stats = {
            "buckets": [
                {
                    "from_hours": lead,
                    "to_hours": lead + 6,
                    "n": len(values),
                    "mae_mw": _r(sum(abs(value) for value in values) / len(values), 0),
                    "bias_mw": _r(sum(values) / len(values), 0),
                }
                for lead, values in sorted(buckets.items())
            ],
            "note": "All forecast vintages pooled by horizon to the target hour. Descriptive, not independent.",
        }
        return self._horizon_stats

    def gate_comparison(self) -> list[dict]:
        if self._gate_metrics is not None:
            return self._gate_metrics

        result = []
        for gate_id, gate in GATES.items():
            predictions = []
            for day in self.data.delivery_days():
                predictions.extend((pair.forecast, pair.actual) for pair in self.pairs(day, gate_id))
            summary = metrics_from_predictions(predictions)
            result.append(
                {
                    **self._gate_static_payload(gate_id),
                    "summary": summary,
                    "snapshot_lead_minutes": (
                        int((gate.closure.hour * 60 + gate.closure.minute) -
                            (int(gate.expected_snapshot[:2]) * 60 + int(gate.expected_snapshot[3:])))
                    ),
                }
            )
        self._gate_metrics = result
        return result

    def _gate_static_payload(self, gate_id: str) -> dict:
        gate = GATES[gate_id]
        return {
            "id": gate.id,
            "label": gate.label,
            "short_label": gate.short_label,
            "market": gate.market,
            "closure_label": gate.closure_label,
            "expected_snapshot": gate.expected_snapshot,
            "product": gate.product,
            "timezone": "Europe/London (GMT in January)",
        }

    # -------------------------------------------------------------- metadata
    def meta(self) -> dict:
        manifest = self.data.manifest
        date_rows = []
        for day in self.data.delivery_days():
            calibration = self.calibration(day, DEFAULT_GATE)
            choice = self.snapshot_for(day, DEFAULT_GATE)
            date_rows.append(
                {
                    "date": day.isoformat(),
                    "status": "calibrated" if calibration.available else "provisional",
                    "snapshot_time": choice.publish_time if choice else None,
                    "fallback": choice.used_fallback if choice else None,
                }
            )
        return {
            "product": "Windwise",
            "tagline": "Day-ahead wind intelligence for GB power procurement.",
            "mode": "Historical replay of January 2026",
            "delivery_window": {
                "start": DELIVERY_START.isoformat(),
                "end": DELIVERY_END.isoformat(),
                "decision_window": "2025-12-31 to 2026-01-30",
            },
            "gates": [self._gate_static_payload(gate_id) for gate_id in GATES],
            "default_gate": DEFAULT_GATE,
            "dates": date_rows,
            "dataset": {
                "counts": manifest.get("counts", {}),
                "ranges_mw": manifest.get("ranges_mw", {}),
                "gate_coverage": manifest.get("gate_coverage", {}),
                "generated_at_utc": manifest.get("generated_at_utc"),
                "sha256": manifest.get("sha256"),
                "database_bytes": self.data.database_bytes,
                "checksum_verified": self.data.checksum_ok,
                "sources": manifest.get("sources", {}),
            },
            "method": {
                "hourly_matching": "Mean of the two half-hourly FUELHH settlement periods per hour.",
                "calibration": (
                    f"One-parameter ratio k = sum(actual) / sum(forecast), expanding window of complete "
                    f"delivery days <= D-2, minimum {MIN_CALIBRATION_DAYS} days."
                ),
                "bands": "Empirical leave-one-day-out residual quantiles.",
                "first_calibrated_day": "2026-01-09",
            },
            "api": {
                "docs": "/api/docs",
                "openapi": "/api/openapi.json",
                "endpoints": [
                    "/api/v1/meta",
                    "/api/v1/desk?date=2026-01-31&gate=n2ex&share=10",
                    "/api/v1/accuracy?gate=n2ex",
                    "/api/v1/snapshots?date=2026-01-28&gate=n2ex",
                    "/api/v1/export/hourly.csv?date=2026-01-31&gate=n2ex&share=10",
                    "/api/v1/export/accuracy.csv?gate=n2ex",
                    "/api/v1/health",
                ],
            },
            "disclaimer": (
                "Windwise is a decision-support prototype built on public Elexon data. It is not a "
                "trading system, does not place orders, and its empirical bands are not guarantees."
            ),
        }


def parse_time(timestamp: str) -> datetime:
    return datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
