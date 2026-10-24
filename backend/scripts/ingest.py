#!/usr/bin/env python3
"""Build the committed Windwise data snapshot from Elexon's public API.

Sources (no other data is used):
  * FUELHH  - half-hourly actual wind generation, fuelType=WIND
  * WINDFOR - hourly national wind generation forecasts, by publish time

The script is deliberately defensive: chunked requests (the API caps range
length), bounded retries, strict validation, deterministic row ordering and a
SHA-256 manifest. The resulting SQLite file is what ships with the app, so the
API is never required at runtime.

Usage:
    python backend/scripts/ingest.py
    python backend/scripts/ingest.py --out-dir backend/app/data
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
DELIVERY_START = date(2026, 1, 1)
DELIVERY_END = date(2026, 1, 31)
# Forecasts published on 30 Dec and 31 Dec are needed for 1 Jan and 2 Jan.
FORECAST_FETCH_START = datetime(2025, 12, 30, tzinfo=timezone.utc)
FORECAST_FETCH_END = datetime(2026, 1, 31, tzinfo=timezone.utc)
USER_AGENT = "Windwise/1.0 (portfolio demo; +https://github.com/sohan-a11y/windwise)"
MIN_GENERATION = 0.0
MAX_GENERATION = 40_000.0

SCHEMA = """
PRAGMA journal_mode = DELETE;
PRAGMA synchronous = OFF;
PRAGMA temp_store = MEMORY;

CREATE TABLE actual (
    start_time   TEXT PRIMARY KEY,
    publish_time TEXT NOT NULL,
    generation   REAL NOT NULL CHECK (generation >= 0)
);

CREATE TABLE forecast (
    publish_time TEXT NOT NULL,
    start_time   TEXT NOT NULL,
    generation   REAL NOT NULL CHECK (generation >= 0),
    PRIMARY KEY (publish_time, start_time)
);

CREATE INDEX idx_forecast_target ON forecast (start_time);

CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

PRAGMA user_version = 1;
"""


class IngestError(RuntimeError):
    pass


def fetch_json(url: str, attempts: int = 4) -> list[dict]:
    """Fetch a JSON payload with bounded exponential backoff."""
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urlopen(req, timeout=120) as response:  # noqa: S310 - fixed https host
                payload = json.load(response)
            if not isinstance(payload, dict) or "data" not in payload:
                raise IngestError(f"Unexpected payload shape from {url}")
            return payload["data"]
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, IngestError) as exc:
            last_error = exc
            if attempt == attempts:
                break
            wait = 2**attempt
            print(f"  request failed ({exc}); retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise IngestError(f"Request failed after {attempts} attempts: {url}") from last_error


def fetch_actuals() -> dict[str, dict]:
    """Fetch every half-hour FUELHH WIND value for January 2026."""
    rows: dict[str, dict] = {}
    cursor = DELIVERY_START
    while cursor <= DELIVERY_END:
        chunk_end = min(cursor + timedelta(days=6), DELIVERY_END)
        url = (
            f"{BASE_URL}/FUELHH?settlementDateFrom={cursor.isoformat()}"
            f"&settlementDateTo={chunk_end.isoformat()}&format=json&fuelType=WIND"
        )
        print(f"FUELHH {cursor} -> {chunk_end}")
        for row in fetch_json(url):
            if row.get("fuelType") != "WIND":
                continue
            start = row.get("startTime")
            published = row.get("publishTime")
            generation = row.get("generation")
            if not isinstance(start, str) or not isinstance(published, str) or generation is None:
                continue
            generation = float(generation)
            if not MIN_GENERATION <= generation <= MAX_GENERATION:
                raise IngestError(f"Implausible actual generation {generation} at {start}")
            previous = rows.get(start)
            # Keep the most recently published revision for a settlement period.
            if previous is None or published > previous["publishTime"]:
                rows[start] = {
                    "startTime": start,
                    "publishTime": published,
                    "settlementDate": row.get("settlementDate"),
                    "settlementPeriod": row.get("settlementPeriod"),
                    "generation": generation,
                }
        cursor = chunk_end + timedelta(days=1)
    return rows


def fetch_forecasts() -> dict[tuple[str, str], float]:
    """Fetch all WINDFOR snapshots needed for January delivery decisions."""
    rows: dict[tuple[str, str], float] = {}
    cursor = FORECAST_FETCH_START
    while cursor < FORECAST_FETCH_END:
        chunk_end = min(cursor + timedelta(days=3), FORECAST_FETCH_END)
        url = (
            f"{BASE_URL}/WINDFOR?publishDateTimeFrom={cursor:%Y-%m-%dT%H:%MZ}"
            f"&publishDateTimeTo={chunk_end:%Y-%m-%dT%H:%MZ}&format=json"
        )
        print(f"WINDFOR {cursor.date()} -> {chunk_end.date()}")
        for row in fetch_json(url):
            published = row.get("publishTime")
            start = row.get("startTime")
            generation = row.get("generation")
            if not isinstance(published, str) or not isinstance(start, str) or generation is None:
                continue
            generation = float(generation)
            if not MIN_GENERATION <= generation <= MAX_GENERATION:
                raise IngestError(f"Implausible forecast generation {generation} at {start} / {published}")
            rows[(published, start)] = generation
        cursor = chunk_end
    return rows


def validate(actuals: dict[str, dict], forecasts: dict[tuple[str, str], float]) -> dict:
    """Fail loudly if the snapshot is not fit for the analytics layer."""
    expected_half_hours = ((DELIVERY_END - DELIVERY_START).days + 1) * 48
    if len(actuals) != expected_half_hours:
        raise IngestError(f"Expected {expected_half_hours} actual half-hours, got {len(actuals)}")

    actual_days = defaultdict(int)
    for row in actuals.values():
        actual_days[row["startTime"][:10]] += 1
    incomplete = {day: count for day, count in actual_days.items() if count != 48}
    if incomplete:
        raise IngestError(f"Incomplete delivery days in actuals: {incomplete}")

    snapshots: dict[str, dict[str, float]] = defaultdict(dict)
    for (published, start), generation in forecasts.items():
        snapshots[published][start] = generation

    gate_checks = {}
    gate_times = {
        "n2ex_0950": (9, 50),
        "epex_0920": (9, 20),
        "epex_hh_1530": (15, 30),
    }
    for gate, (hour, minute) in gate_times.items():
        available = 0
        fallbacks = []
        for offset in range((DELIVERY_END - DELIVERY_START).days + 1):
            day = DELIVERY_START + timedelta(days=offset)
            cutoff = datetime.combine(day - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
            cutoff = cutoff.replace(hour=hour, minute=minute)
            candidates = sorted((p for p in snapshots if p < cutoff.strftime("%Y-%m-%dT%H:%M:%SZ")), reverse=True)
            chosen = None
            for candidate in candidates:
                values = snapshots[candidate]
                if all(f"{day.isoformat()}T{h:02d}:00:00Z" in values for h in range(24)):
                    chosen = candidate
                    break
            if chosen is None:
                fallbacks.append({"date": day.isoformat(), "reason": "no snapshot with 24h coverage"})
                continue
            available += 1
            latest = candidates[0] if candidates else None
            if chosen != latest:
                fallbacks.append({"date": day.isoformat(), "chosen": chosen, "latest": latest})
        gate_checks[gate] = {"days_with_cover": available, "fallbacks": fallbacks}

    for gate, check in gate_checks.items():
        if check["days_with_cover"] != 31:
            raise IngestError(f"Gate {gate} covers only {check['days_with_cover']} delivery days")

    values = [row["generation"] for row in actuals.values()]
    forecast_values = list(forecasts.values())
    return {
        "actual_half_hours": len(actuals),
        "actual_days": len(actual_days),
        "forecast_rows": len(forecasts),
        "forecast_snapshots": len(snapshots),
        "actual_generation_mw": {"min": min(values), "max": max(values)},
        "forecast_generation_mw": {"min": min(forecast_values), "max": max(forecast_values)},
        "gates": gate_checks,
    }


def build_database(out_path: Path, actuals: dict[str, dict], forecasts: dict[tuple[str, str], float], quality: dict) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        out_path.unlink()
    connection = sqlite3.connect(out_path)
    try:
        connection.executescript(SCHEMA)
        connection.executemany(
            "INSERT INTO actual (start_time, publish_time, generation) VALUES (?, ?, ?)",
            [
                (row["startTime"], row["publishTime"], row["generation"])
                for row in sorted(actuals.values(), key=lambda r: r["startTime"])
            ],
        )
        connection.executemany(
            "INSERT INTO forecast (publish_time, start_time, generation) VALUES (?, ?, ?)",
            [(published, start, generation) for (published, start), generation in sorted(forecasts.items())],
        )
        meta = {
            "product": "Windwise",
            "schema_version": "1",
            "delivery_start": DELIVERY_START.isoformat(),
            "delivery_end": DELIVERY_END.isoformat(),
            "sources": "Elexon Insights Solution: FUELHH (fuelType=WIND), WINDFOR",
            "quality": json.dumps(quality, sort_keys=True),
        }
        connection.executemany("INSERT INTO meta (key, value) VALUES (?, ?)", sorted(meta.items()))
        connection.commit()
        connection.execute("VACUUM")
    finally:
        connection.close()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, default=Path(__file__).resolve().parents[1] / "app" / "data")
    args = parser.parse_args()

    print("Fetching Elexon FUELHH WIND actuals...")
    actuals = fetch_actuals()
    print("Fetching Elexon WINDFOR snapshots...")
    forecasts = fetch_forecasts()
    print(f"Fetched {len(actuals)} actual half-hours and {len(forecasts)} forecast rows")

    quality = validate(actuals, forecasts)
    out_path = args.out_dir / "windwise.sqlite"
    build_database(out_path, actuals, forecasts, quality)
    checksum = sha256(out_path)

    manifest = {
        "product": "Windwise",
        "snapshot_version": 1,
        "generated_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "database": out_path.name,
        "database_bytes": out_path.stat().st_size,
        "sha256": checksum,
        "delivery_window": {"start": DELIVERY_START.isoformat(), "end": DELIVERY_END.isoformat()},
        "sources": {
            "actuals": {
                "dataset": "FUELHH",
                "filter": "fuelType=WIND",
                "endpoint": f"{BASE_URL}/FUELHH",
                "documentation": "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream",
            },
            "forecasts": {
                "dataset": "WINDFOR",
                "endpoint": f"{BASE_URL}/WINDFOR",
                "documentation": "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream",
            },
        },
        "counts": {
            "actual_half_hours": quality["actual_half_hours"],
            "actual_delivery_days": quality["actual_days"],
            "forecast_rows": quality["forecast_rows"],
            "forecast_snapshots": quality["forecast_snapshots"],
        },
        "ranges_mw": {
            "actual": quality["actual_generation_mw"],
            "forecast": quality["forecast_generation_mw"],
        },
        "gate_coverage": quality["gates"],
        "notes": [
            "Only FUELHH WIND and WINDFOR are used.",
            "Settlement days in January are GMT, so UTC and local delivery time coincide.",
            "The database is deterministic for a fixed payload but SQLite file bytes may vary across versions.",
        ],
    }
    manifest_path = args.out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print("\nSnapshot written")
    print(f"  database : {out_path} ({out_path.stat().st_size / 1024:.0f} KB)")
    print(f"  sha256   : {checksum}")
    print(f"  manifest : {manifest_path}")
    print(f"  actuals  : {quality['actual_half_hours']} half-hours across {quality['actual_days']} days")
    print(f"  forecasts: {quality['forecast_rows']} rows across {quality['forecast_snapshots']} snapshots")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
