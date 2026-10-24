"""Tests and evaluation benchmarks for the LLM Copilot."""

from app.llm_copilot import DispatchBriefingPayload, copilot_engine


def test_copilot_structured_output_and_rag():
    sample_desk = {
        "summary": {
            "cover_90_mwh": 9568.0,
            "cover_90_peak_mw": 451.0,
            "forecast_avg_mw": 12313.0,
        },
        "calibration": {"k": 0.8613},
    }
    briefing = copilot_engine.generate_desk_briefing(
        date_text="2026-01-31",
        gate="n2ex",
        share_pct=10.0,
        desk_data=sample_desk,
    )

    # Strict Schema Verification
    assert isinstance(briefing, DispatchBriefingPayload)
    assert briefing.desk_date == "2026-01-31"
    assert briefing.gate_name == "N2EX"
    assert briefing.recommendation.action == "PROCURE_FIRM_THERMAL"
    assert briefing.recommendation.suggested_procurement_mwh == 9568.0
    assert briefing.recommendation.peak_shortfall_mw == 451.0

    # Local RAG Grounding Verification
    rule_codes = [r.rule_code for r in briefing.regulatory_context]
    assert "P305" in rule_codes
    assert "GATE_N2EX" in rule_codes

    # Telemetry and Cost Control Verification
    assert briefing.telemetry.total_tokens > 0
    assert briefing.telemetry.estimated_cost_usd > 0.0
    assert briefing.telemetry.latency_ms >= 0.0
    assert briefing.telemetry.cache_hit is False

    # Second invocation should hit cryptographic SHA-256 cache
    cached_briefing = copilot_engine.generate_desk_briefing(
        date_text="2026-01-31",
        gate="n2ex",
        share_pct=10.0,
        desk_data=sample_desk,
    )
    assert cached_briefing.telemetry.cache_hit is True
    assert cached_briefing.telemetry.latency_ms < 50.0


def test_copilot_automated_eval_suite():
    eval_report = copilot_engine.run_eval_suite()
    assert eval_report["status"] == "PASSED"
    assert eval_report["schema_pass_rate"] == 1.0
    assert eval_report["latency_sla_met"] is True
    assert len(eval_report["test_results"]) == 3
