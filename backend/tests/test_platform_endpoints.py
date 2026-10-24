"""Integration tests for scientific distribution, distributed jobs, LLM copilot, and metrics endpoints."""


def test_scientific_distribution_endpoint(client):
    resp = client.get("/api/v1/scientific/distribution?gate=n2ex&points=30")
    assert resp.status_code == 200
    data = resp.json()
    assert data["gate"] == "n2ex"
    assert data["sample_size"] > 0
    assert "mean_bias_mw" in data
    assert "var_95_mw" in data
    assert "cvar_95_mw" in data
    assert len(data["density_points"]) == 30


def test_monte_carlo_jobs_lifecycle(client):
    submit_resp = client.post(
        "/api/v1/jobs/monte-carlo",
        json={
            "forecast_mw": 12313.0,
            "portfolio_share_pct": 10.0,
            "firm_threshold_mw": 8326.0,
            "iterations": 500,
        },
    )
    assert submit_resp.status_code == 200
    sub_data = submit_resp.json()
    job_id = sub_data["job_id"]
    assert job_id.startswith("job_")

    poll_resp = client.get(f"/api/v1/jobs/{job_id}")
    assert poll_resp.status_code == 200
    job_data = poll_resp.json()
    assert job_data["status"] == "COMPLETED"
    assert job_data["progress"] == 1.0
    assert "loss_of_load_probability" in job_data["result"]


def test_copilot_endpoints(client):
    # Briefing
    briefing_resp = client.post(
        "/api/v1/copilot/briefing",
        json={"date": "2026-01-31", "gate": "n2ex", "share": 10.0},
    )
    assert briefing_resp.status_code == 200
    data = briefing_resp.json()
    assert data["gate_name"] == "N2EX"
    assert "recommendation" in data
    assert "telemetry" in data
    assert data["telemetry"]["total_tokens"] > 0

    # Eval
    eval_resp = client.get("/api/v1/copilot/eval")
    assert eval_resp.status_code == 200
    eval_data = eval_resp.json()
    assert eval_data["status"] == "PASSED"
    assert eval_data["schema_pass_rate"] == 1.0


def test_metrics_endpoint_json_and_prometheus(client):
    # JSON format
    resp_json = client.get("/api/v1/metrics?format=json")
    assert resp_json.status_code == 200
    data = resp_json.json()
    assert "uptime_seconds" in data
    assert data["requests"]["total"] > 0
    assert data["system"]["status"] == "HEALTHY"

    # Prometheus format
    resp_prom = client.get("/api/v1/metrics?format=prometheus")
    assert resp_prom.status_code == 200
    text = resp_prom.text
    assert "windwise_uptime_seconds" in text
    assert "windwise_http_requests_total" in text
