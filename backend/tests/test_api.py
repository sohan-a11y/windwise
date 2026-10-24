"""API contract tests."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


def test_meta(client):
    response = client.get("/api/v1/meta")
    assert response.status_code == 200
    payload = response.json()
    assert payload["product"] == "Windwise"
    assert len(payload["dates"]) == 31
    assert payload["dates"][0]["status"] == "provisional"
    assert payload["dates"][8]["status"] == "calibrated"
    assert payload["dataset"]["checksum_verified"] is True
    assert payload["dataset"]["counts"]["actual_half_hours"] == 1488
    assert len(payload["gates"]) == 3


def test_health(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["dataset"]["checksum_verified"] is True
    assert all(row["days_with_snapshot"] == 31 for row in payload["gates"].values())


def test_desk_endpoint(client):
    response = client.get("/api/v1/desk", params={"date": "2026-01-28", "gate": "n2ex", "share": 15})
    assert response.status_code == 200
    payload = response.json()
    assert payload["delivery_date"] == "2026-01-28"
    assert payload["share_pct"] == 15
    assert len(payload["hourly"]) == 24
    assert payload["cover"]["confidence"]["p90"]["mwh"] > 0


def test_accuracy_endpoint(client):
    response = client.get("/api/v1/accuracy", params={"gate": "epex_hh"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["raw"]["n"] == 744
    assert payload["summary"]["calibrated"]["n"] == 552
    assert len(payload["daily"]) == 31
    assert len(payload["scatter"]) == 744


def test_snapshots_endpoint(client):
    response = client.get("/api/v1/snapshots", params={"date": "2026-01-28", "gate": "n2ex"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["delivery_date"] == "2026-01-28"
    assert payload["selected_snapshot"] == "2026-01-27T09:30:00Z"
    assert len(payload["snapshots"]) >= 12


def test_validation_errors_are_structured(client):
    bad_date = client.get("/api/v1/desk", params={"date": "2026-02-01"})
    assert bad_date.status_code == 422
    bad_gate = client.get("/api/v1/desk", params={"gate": "nope"})
    assert bad_gate.status_code == 422
    bad_share = client.get("/api/v1/desk", params={"share": 150})
    assert bad_share.status_code == 422
    assert bad_share.json()["error"]["code"] == "invalid_request"


def test_hourly_csv(client):
    response = client.get(
        "/api/v1/export/hourly.csv",
        params={"date": "2026-01-31", "gate": "n2ex", "share": 10},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    lines = response.text.strip().splitlines()
    assert len(lines) == 25
    assert lines[0].startswith("delivery_date,gate,snapshot_publish_time")
    assert "2026-01-31" in lines[1]


def test_accuracy_csv(client):
    response = client.get("/api/v1/export/accuracy.csv", params={"gate": "n2ex"})
    assert response.status_code == 200
    lines = response.text.strip().splitlines()
    assert len(lines) == 32
    assert lines[0].startswith("delivery_date,status,k")


def test_security_headers(client):
    response = client.get("/api/v1/meta")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "content-security-policy" in response.headers
    assert response.headers["cache-control"].startswith("public")


def test_manifest_matches_committed_database():
    data_dir = Path(__file__).resolve().parents[1] / "app" / "data"
    manifest = json.loads((data_dir / "manifest.json").read_text(encoding="utf-8"))
    database = data_dir / manifest["database"]
    digest = hashlib.sha256(database.read_bytes()).hexdigest()
    assert digest == manifest["sha256"]
    assert manifest["counts"]["actual_half_hours"] == 1488
    assert manifest["counts"]["forecast_rows"] == 18688
    assert database.stat().st_size == manifest["database_bytes"]
