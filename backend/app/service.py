"""Process-wide service wiring with small response caches."""

from __future__ import annotations

from functools import lru_cache

from .analytics import Analytics, GATES
from .data_store import WindData

_analytics: Analytics | None = None


def get_analytics() -> Analytics:
    global _analytics
    if _analytics is None:
        _analytics = Analytics(WindData.load())
    return _analytics


def reset_analytics() -> None:
    """Test helper: force a reload of the committed snapshot."""
    global _analytics
    _analytics = None


@lru_cache(maxsize=128)
def desk_payload(date_text: str, gate: str, share: float) -> dict:
    analytics = get_analytics()
    day = _parse_date(date_text)
    _validate_gate(gate)
    return analytics.desk(day, gate, share)


@lru_cache(maxsize=16)
def accuracy_payload(gate: str) -> dict:
    _validate_gate(gate)
    return get_analytics().accuracy(gate)


@lru_cache(maxsize=64)
def snapshots_payload(date_text: str, gate: str) -> dict:
    _validate_gate(gate)
    return get_analytics().snapshots(_parse_date(date_text), gate)


@lru_cache(maxsize=4)
def meta_payload() -> dict:
    return get_analytics().meta()


def _parse_date(date_text: str):
    from datetime import date

    try:
        return date.fromisoformat(date_text)
    except ValueError as exc:
        raise ValueError(f"Invalid date '{date_text}'. Use YYYY-MM-DD.") from exc


def _validate_gate(gate: str) -> None:
    if gate not in GATES:
        raise ValueError(f"Unknown gate '{gate}'. Choose one of: {', '.join(GATES)}.")
