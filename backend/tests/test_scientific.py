"""Tests for the scientific and numerical computing engine."""

from app.scientific import ScientificEngine


def test_scientific_risk_metrics_and_kde():
    # Synthetic residual dataset with known positive bias
    residuals = [1840.0, 1200.0, 2500.0, -300.0, 3100.0, 950.0, 1400.0, 2200.0] * 10
    engine = ScientificEngine(residuals)
    profile = engine.compute_risk_profile(n_density_points=25)

    assert profile.sample_size == len(residuals)
    assert profile.mean_bias_mw > 0.0  # Demonstrates positive over-forecast bias
    assert profile.mae_mw > 0.0
    assert profile.rmse_mw >= profile.mae_mw  # Mathematical guarantee
    assert profile.var_95_mw >= profile.var_90_mw
    assert profile.var_99_mw >= profile.var_95_mw
    assert profile.cvar_95_mw >= profile.var_95_mw  # Expected Shortfall >= VaR
    assert len(profile.density_points) == 25
    assert all(p["density"] >= 0.0 for p in profile.density_points)


def test_monte_carlo_dispatch_simulation():
    residuals = [1840.0, 1500.0, 2100.0, -200.0, 2800.0] * 20
    engine = ScientificEngine(residuals)
    res = engine.simulate_monte_carlo_dispatch(
        forecast_mw=12000.0,
        portfolio_share_pct=10.0,
        firm_threshold_mw=8000.0,
        iterations=500,
        random_seed=42,
    )

    assert res["iterations"] == 500
    assert res["forecast_mw"] == 1200.0
    assert res["firm_threshold_mw"] == 800.0
    assert 0.0 <= res["loss_of_load_probability"] <= 1.0
    assert res["p95_peaker_call_mw"] >= res["mean_shortfall_mw"]
    assert res["expected_energy_unserved_mwh"] >= 0.0
