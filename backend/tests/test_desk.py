"""Desk payload, cover arithmetic and the replay narrative."""

from __future__ import annotations

from datetime import date

import pytest

from app.analytics import Analytics, metrics_from_predictions


def test_metrics_known_values():
    metrics = metrics_from_predictions([(10, 8), (12, 12), (9, 11)])
    assert metrics["n"] == 3
    assert metrics["bias_mw"] == pytest.approx(0.0)
    assert metrics["mae_mw"] == pytest.approx(1.3, abs=0.05)
    assert metrics["rmse_mw"] == pytest.approx(1.6, abs=0.05)
    assert metrics["overforecast_hours"] == 1
    assert metrics["p50_error_mw"] == 0


def test_desk_summary_and_hourly_shape(analytics: Analytics):
    desk = analytics.desk(date(2026, 1, 31), "n2ex", 10)
    assert desk["delivery_date"] == "2026-01-31"
    assert desk["gate"]["snapshot_time"] == "2026-01-30T09:30:00Z"
    assert desk["status"] == "calibrated"
    assert len(desk["hourly"]) == 24
    assert desk["national"]["hours"] == 24
    assert desk["national"]["forecast_peak_mw"] >= desk["national"]["forecast_average_mw"]
    assert desk["national"]["calibrated_average_mw"] < desk["national"]["forecast_average_mw"]
    assert desk["calibration"]["k"] == pytest.approx(0.863, abs=0.005)
    assert len(desk["outturn"]["raw"]) > 10
    assert desk["outturn"]["available"] is True


def test_cover_is_capped_and_additive(analytics: Analytics):
    desk = analytics.desk(date(2026, 1, 31), "n2ex", 10)
    for row in desk["hourly"]:
        forecast_share = row["forecast_share_mw"]
        cover = row["cover_mw"]["p90"]
        assert cover is not None
        assert 0 <= cover <= forecast_share + 1
        assert row["firm_mw"]["p90"] >= 0
    summary = desk["cover"]["confidence"]["p90"]
    hourly_values = [row["cover_mw"]["p90"] for row in desk["hourly"]]
    assert summary["mwh"] == pytest.approx(sum(hourly_values), abs=1)
    assert summary["peak_mw"] == max(hourly_values)


def test_share_scales_linearly(analytics: Analytics):
    ten = analytics.desk(date(2026, 1, 31), "n2ex", 10)
    twenty = analytics.desk(date(2026, 1, 31), "n2ex", 20)
    for low, high in zip(ten["hourly"], twenty["hourly"]):
        if low["cover_mw"]["p90"] is None:
            assert high["cover_mw"]["p90"] is None
        else:
            assert high["cover_mw"]["p90"] == pytest.approx(low["cover_mw"]["p90"] * 2, abs=1)


def test_tail_day_is_not_hidden(analytics: Analytics):
    desk = analytics.desk(date(2026, 1, 28), "n2ex", 10)
    assert desk["outturn"]["raw"]["bias_mw"] > 4000
    assert desk["outturn"]["hours_in_band_80"] <= 6
    # Even the calibrated forecast is materially wrong on this tail day.
    assert desk["outturn"]["calibrated"]["mae_mw"] > 1000
    assert desk["cover"]["confidence"]["stress"]["peak_mw"] > desk["cover"]["confidence"]["p90"]["peak_mw"]


def test_revision_is_against_previous_snapshot(analytics: Analytics):
    desk = analytics.desk(date(2026, 1, 31), "n2ex", 10)
    revision = desk["revision"]
    assert revision is not None
    assert revision["previous_snapshot"] == "2026-01-30T07:30:00Z"
    assert revision["mean_abs_change_mw"] >= 0
    assert revision["max_abs_change_mw"] >= revision["mean_abs_change_mw"]


def test_accuracy_worst_hours_and_levels(analytics: Analytics):
    accuracy = analytics.accuracy("n2ex")
    assert len(accuracy["worst"]) == 10
    assert accuracy["worst"][0]["error_mw"] > 6000
    assert len(accuracy["levels"]) == 5
    high = accuracy["levels"][-1]
    assert high["bias_mw"] > 4000
    assert len(accuracy["heatmap"]) == 744


def test_gate_comparison_has_all_markets(analytics: Analytics):
    gates = analytics.accuracy("n2ex")["gates"]
    assert {row["id"] for row in gates} == {"n2ex", "epex", "epex_hh"}
    assert all(row["summary"]["n"] == 744 for row in gates)


def test_snapshots_payload(analytics: Analytics):
    payload = analytics.snapshots(date(2026, 1, 28), "n2ex")
    assert payload["selected_snapshot"] == "2026-01-27T09:30:00Z"
    assert len(payload["series"]) == len(payload["snapshots"])
    assert all(len(series["values"]) == 24 for series in payload["series"])
    assert len(payload["actual"]) == 24
    assert any(row["selected"] for row in payload["snapshots"])
    assert payload["gates"][0]["snapshot_time"] == "2026-01-27T09:30:00Z"
