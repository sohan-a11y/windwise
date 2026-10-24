"""Gate selection and hourly matching rules."""

from __future__ import annotations

from datetime import date

import pytest

from app.analytics import GATES, Analytics, _gate_cutoff

JAN = date(2026, 1, 31)


@pytest.mark.parametrize(
    ("gate_id", "snapshot", "minutes"),
    [
        ("n2ex", "2026-01-30T09:30:00Z", 20),
        ("epex", "2026-01-30T07:30:00Z", 110),
        ("epex_hh", "2026-01-30T11:30:00Z", 240),
    ],
)
def test_gate_uses_expected_snapshot(analytics: Analytics, gate_id: str, snapshot: str, minutes: int):
    choice = analytics.snapshot_for(JAN, gate_id)
    assert choice is not None
    assert choice.publish_time == snapshot
    assert choice.used_fallback is False
    assert choice.expected_missing is False
    desk = analytics.desk(JAN, gate_id, 10)
    assert desk["gate"]["minutes_before_gate"] == minutes


def test_epx_half_hourly_missing_snapshot_is_flagged(analytics: Analytics):
    choice = analytics.snapshot_for(date(2026, 1, 16), "epex_hh")
    assert choice is not None
    # The 11:30 snapshot was not published; an unscheduled 12:25 replacement was.
    assert choice.publish_time == "2026-01-15T12:25:00Z"
    assert choice.expected_missing is True
    desk = analytics.desk(date(2026, 1, 16), "epex_hh", 10)
    assert desk["data_quality"]["expected_snapshot_missing"] is True
    assert "11:30" in (desk["data_quality"]["note"] or "")


def test_no_snapshot_after_gate(analytics: Analytics):
    for day in analytics.data.delivery_days():
        for gate_id, gate in GATES.items():
            choice = analytics.snapshot_for(day, gate_id)
            assert choice is not None
            assert choice.publish_time < _gate_cutoff(day, gate).strftime("%Y-%m-%dT%H:%M:%SZ")


def test_every_gate_has_24_hours_every_day(analytics: Analytics):
    for gate_id in GATES:
        total = 0
        for day in analytics.data.delivery_days():
            pairs = analytics.pairs(day, gate_id)
            assert len(pairs) == 24, (day, gate_id, len(pairs))
            assert all(pair.forecast > 0 and pair.actual > 0 for pair in pairs)
            total += len(pairs)
        assert total == 744


def test_hourly_actual_averages_two_settlement_periods(analytics: Analytics):
    day = date(2026, 1, 12)
    first = analytics.data.actuals[f"{day.isoformat()}T00:00:00Z"]
    second = analytics.data.actuals[f"{day.isoformat()}T00:30:00Z"]
    hourly = analytics.data.hourly_actuals(day)
    assert hourly[0] == pytest.approx((first + second) / 2)
    assert len(hourly) == 24


def test_forecast_is_not_interpolated(analytics: Analytics):
    day = date(2026, 1, 20)
    choice = analytics.snapshot_for(day, "n2ex")
    assert choice is not None
    snapshot = analytics.data.forecasts[choice.publish_time]
    assert f"{day.isoformat()}T00:00:00Z" in snapshot
    # Forecasts are hourly, so there is no :30 key to interpolate from.
    assert f"{day.isoformat()}T00:30:00Z" not in snapshot
