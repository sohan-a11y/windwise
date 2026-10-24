"""Calibration, bands and no-look-ahead guarantees."""

from __future__ import annotations

from datetime import date

import pytest

from app.analytics import Analytics, quantile
from app.data_store import WindData


def test_calibration_unlocks_on_ninth(analytics: Analytics):
    assert analytics.calibration(date(2026, 1, 8), "n2ex").available is False
    calibration = analytics.calibration(date(2026, 1, 9), "n2ex")
    assert calibration.available is True
    assert calibration.days_used == 7
    assert calibration.history_to == "2026-01-07"
    assert calibration.k == pytest.approx(0.867, abs=0.002)
    assert calibration.hours_used == 168


def test_provisional_days_do_not_invent_confidence(analytics: Analytics):
    desk = analytics.desk(date(2026, 1, 5), "n2ex", 10)
    assert desk["status"] == "provisional"
    assert desk["cover"]["confidence"]["p80"] is None
    assert all(row["cover_mw"]["p90"] is None for row in desk["hourly"])
    assert all(row["band80_low_mw"] is None for row in desk["hourly"])


def test_band_quantiles_are_ordered(analytics: Analytics):
    calibration = analytics.calibration(date(2026, 1, 25), "n2ex")
    q = calibration.q
    assert q["min"] <= q["p025"] <= q["p05"] <= q["p10"] <= q["p20"] <= q["p50"]
    assert q["p50"] <= q["p80"] <= q["p90"] <= q["p95"] <= q["p975"] <= q["max"]


def test_leave_one_day_out_bands_are_used(analytics: Analytics):
    calibration = analytics.calibration(date(2026, 1, 20), "n2ex")
    assert calibration.available
    # The 80% band should be meaningfully wider than a single residual.
    assert calibration.q["p90"] - calibration.q["p10"] > 3000


def test_d_minus_one_actuals_do_not_leak(analytics: Analytics, data: WindData):
    baseline = analytics.calibration(date(2026, 1, 31), "n2ex")
    mutated = data.clone()
    for start_time in list(mutated.actuals):
        if start_time.startswith("2026-01-30"):
            mutated.actuals[start_time] += 5000
    mutated_analytics = Analytics(mutated)
    after_future_actuals = mutated_analytics.calibration(date(2026, 1, 31), "n2ex")
    assert after_future_actuals.k == pytest.approx(baseline.k)
    assert after_future_actuals.q == pytest.approx(baseline.q)


def test_d_minus_two_actuals_do_affect_calibration(analytics: Analytics, data: WindData):
    baseline = analytics.calibration(date(2026, 1, 31), "n2ex")
    mutated = data.clone()
    for start_time in list(mutated.actuals):
        if start_time.startswith("2026-01-29"):
            mutated.actuals[start_time] += 5000
    mutated_analytics = Analytics(mutated)
    changed = mutated_analytics.calibration(date(2026, 1, 31), "n2ex")
    assert changed.k > baseline.k


def test_future_forecast_revisions_do_not_leak(analytics: Analytics, data: WindData):
    baseline = analytics.calibration(date(2026, 1, 31), "n2ex")
    mutated = data.clone()
    # Add a fictional, very different snapshot published after gate closure.
    mutated.forecasts["2026-01-30T22:30:00Z"] = {
        key: value * 0.5
        for key, value in mutated.forecasts["2026-01-30T22:30:00Z"].items()
    }
    mutated_analytics = Analytics(mutated)
    after = mutated_analytics.calibration(date(2026, 1, 31), "n2ex")
    assert after.k == pytest.approx(baseline.k)
    assert after.q == pytest.approx(baseline.q)


def test_quantile_interpolates():
    assert quantile([], 0.5) is None
    assert quantile([10], 0.5) == 10
    assert quantile([0, 10], 0.5) == 5
    assert quantile([0, 10, 20], 0.25) == 5


def test_calibration_improves_pooled_accuracy(analytics: Analytics):
    accuracy = analytics.accuracy("n2ex")
    raw = accuracy["summary"]["raw"]
    calibrated = accuracy["summary"]["calibrated"]
    assert raw["n"] == 744
    assert calibrated["n"] == 552
    assert raw["bias_mw"] > 1500
    assert calibrated["mae_mw"] < raw["mae_mw"] * 0.7
    assert abs(calibrated["bias_mw"]) < 250
    assert calibrated["rmse_mw"] < raw["rmse_mw"] * 0.75


def test_coverage_is_reported_honestly(analytics: Analytics):
    coverage = analytics.accuracy("n2ex")["coverage"]
    central_80 = next(row for row in coverage["two_sided"] if row["id"] == "80")
    central_95 = next(row for row in coverage["two_sided"] if row["id"] == "95")
    assert 78 <= central_80["empirical_pct"] <= 84
    # The nominal 95% band under-covers in this sample; do not disguise it.
    assert 88 <= central_95["empirical_pct"] <= 94
    one_sided = {row["id"]: row for row in coverage["one_sided"]}
    assert 83 <= one_sided["90"]["empirical_pct"] <= 94
    assert one_sided["stress"]["empirical_pct"] > 95
