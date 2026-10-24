"""Read-only loading of the committed Windwise SQLite snapshot.

The database is intentionally tiny (~1 MB), so it is loaded into memory once at
process start. This keeps API latency flat and makes the deployment independent
of the Elexon API at request time.
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

DELIVERY_START = date(2026, 1, 1)
DELIVERY_END = date(2026, 1, 31)

_HERE = Path(__file__).resolve().parent


def _candidate_database_paths() -> list[Path]:
    candidates: list[Path] = []
    override = os.environ.get("WINDWISE_DB_PATH")
    if override:
        candidates.append(Path(override))
    candidates.extend(
        [
            _HERE / "data" / "windwise.sqlite",
            _HERE.parents[1] / "backend" / "app" / "data" / "windwise.sqlite",
            Path.cwd() / "backend" / "app" / "data" / "windwise.sqlite",
            Path.cwd() / "app" / "data" / "windwise.sqlite",
        ]
    )
    return candidates


def _resolve_database_path() -> Path:
    for candidate in _candidate_database_paths():
        if candidate.is_file():
            return candidate
    searched = "\n".join(f"  - {path}" for path in _candidate_database_paths())
    raise FileNotFoundError(f"Windwise database not found. Searched:\n{searched}")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


@dataclass
class WindData:
    """In-memory representation of the raw Elexon snapshot."""

    actuals: dict[str, float]
    actual_publish: dict[str, str]
    forecasts: dict[str, dict[str, float]]
    manifest: dict
    database_path: str
    checksum_ok: bool
    database_bytes: int
    _hourly_actual_cache: dict[str, dict[int, float]] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path | None = None) -> "WindData":
        database_path = path or _resolve_database_path()
        manifest_path = database_path.with_name("manifest.json")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}

        uri = f"file:{database_path.as_posix()}?mode=ro"
        try:
            connection = sqlite3.connect(uri, uri=True)
        except sqlite3.Error:
            connection = sqlite3.connect(str(database_path))
        try:
            actuals: dict[str, float] = {}
            actual_publish: dict[str, str] = {}
            for start_time, publish_time, generation in connection.execute(
                "SELECT start_time, publish_time, generation FROM actual ORDER BY start_time"
            ):
                actuals[start_time] = float(generation)
                actual_publish[start_time] = publish_time

            forecasts: dict[str, dict[str, float]] = {}
            for publish_time, start_time, generation in connection.execute(
                "SELECT publish_time, start_time, generation FROM forecast ORDER BY publish_time, start_time"
            ):
                forecasts.setdefault(publish_time, {})[start_time] = float(generation)
        finally:
            connection.close()

        checksum = manifest.get("sha256")
        actual_checksum = _sha256(database_path)
        return cls(
            actuals=actuals,
            actual_publish=actual_publish,
            forecasts=forecasts,
            manifest=manifest,
            database_path=str(database_path),
            checksum_ok=bool(checksum) and checksum == actual_checksum,
            database_bytes=database_path.stat().st_size,
        )

    def hourly_actuals(self, day: date) -> dict[int, float]:
        """Average the two FUELHH settlement periods into an hourly actual."""
        key = day.isoformat()
        cached = self._hourly_actual_cache.get(key)
        if cached is not None:
            return cached

        result: dict[int, float] = {}
        for hour in range(24):
            values = []
            for minute in (0, 30):
                value = self.actuals.get(f"{key}T{hour:02d}:{minute:02d}:00Z")
                if value is not None:
                    values.append(value)
            if len(values) == 2:
                result[hour] = sum(values) / 2
        self._hourly_actual_cache[key] = result
        return result

    def has_complete_actuals(self, day: date) -> bool:
        return len(self.hourly_actuals(day)) == 24

    def snapshot_coverage(self, publish_time: str, day: date) -> int:
        snapshot = self.forecasts.get(publish_time, {})
        return sum(1 for hour in range(24) if f"{day.isoformat()}T{hour:02d}:00:00Z" in snapshot)

    @property
    def first_delivery_day(self) -> date:
        return DELIVERY_START

    @property
    def last_delivery_day(self) -> date:
        return DELIVERY_END

    def delivery_days(self) -> list[date]:
        count = (DELIVERY_END - DELIVERY_START).days + 1
        return [DELIVERY_START + timedelta(days=offset) for offset in range(count)]

    def clone(self) -> "WindData":
        """Deep-enough copy used by the no-look-ahead tests."""
        return WindData(
            actuals=dict(self.actuals),
            actual_publish=dict(self.actual_publish),
            forecasts={publish: dict(values) for publish, values in self.forecasts.items()},
            manifest=dict(self.manifest),
            database_path=self.database_path,
            checksum_ok=self.checksum_ok,
            database_bytes=self.database_bytes,
        )
