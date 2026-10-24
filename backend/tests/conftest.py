"""Shared fixtures. The committed SQLite snapshot makes these tests hermetic."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.analytics import Analytics  # noqa: E402
from app.data_store import WindData  # noqa: E402


@pytest.fixture(scope="session")
def data() -> WindData:
    return WindData.load()


@pytest.fixture(scope="session")
def analytics(data: WindData) -> Analytics:
    return Analytics(data)


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
