"""Scientific and numerical computing module for Windwise power systems.

Leverages NumPy and SciPy for:
- Non-parametric Kernel Density Estimation (KDE) of wind forecast residuals.
- Skew-Normal distribution fitting for asymmetric renewable over-forecast tails.
- Financial & balance-sheet risk metrics: Value-at-Risk (VaR 95/99) and Conditional
  Value-at-Risk (CVaR / Expected Shortfall).
- Vectorized Monte Carlo reserve shortfall simulation across synthetic grid scenarios.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

try:
    import numpy as np
except ImportError:
    np = None  # type: ignore

try:
    from scipy import stats as sp_stats
except ImportError:
    sp_stats = None  # type: ignore


@dataclass
class RiskMetrics:
    sample_size: int
    mean_bias_mw: float
    mae_mw: float
    rmse_mw: float
    std_mw: float
    skewness: float
    kurtosis: float
    var_90_mw: float
    var_95_mw: float
    var_99_mw: float
    cvar_95_mw: float
    skewnorm_params: dict[str, float]
    density_points: list[dict[str, float]]


class ScientificEngine:
    """Numerical & scientific analytics engine for grid risk dispatch."""

    def __init__(self, residuals: list[float]):
        """Initialize with an array of residuals (forecast - actual in MW)."""
        self.raw_residuals = [float(r) for r in residuals if r is not None and not math.isnan(r)]
        if not self.raw_residuals:
            raise ValueError("Cannot initialize ScientificEngine with empty residuals.")

    def compute_risk_profile(self, n_density_points: int = 50) -> RiskMetrics:
        """Compute comprehensive scientific error distribution & tail risk metrics."""
        data = self.raw_residuals
        n = len(data)
        
        # Mean Bias, MAE, RMSE
        mean_bias = sum(data) / n
        abs_errors = [abs(x) for x in data]
        mae = sum(abs_errors) / n
        sq_errors = [x ** 2 for x in data]
        rmse = math.sqrt(sum(sq_errors) / n)
        
        # Standard Deviation & Higher Moments (Skewness & Kurtosis)
        variance = sum((x - mean_bias) ** 2 for x in data) / max(1, n - 1)
        std = math.sqrt(variance)
        
        if std > 0:
            m3 = sum((x - mean_bias) ** 3 for x in data) / n
            skewness = m3 / (std ** 3)
            m4 = sum((x - mean_bias) ** 4 for x in data) / n
            kurtosis = (m4 / (std ** 4)) - 3.0  # Excess kurtosis
        else:
            skewness = 0.0
            kurtosis = 0.0

        # Sorted for quantile calculations (Residual = Forecast - Actual)
        # Shortfall = Forecast - Actual > 0 is over-forecast risk
        sorted_res = sorted(data)
        
        def quantile(p: float) -> float:
            idx = int(p * (n - 1))
            return sorted_res[min(max(0, idx), n - 1)]

        var_90 = quantile(0.90)
        var_95 = quantile(0.95)
        var_99 = quantile(0.99)

        # CVaR (Expected Shortfall beyond VaR 95)
        tail_95 = [x for x in sorted_res if x >= var_95]
        cvar_95 = sum(tail_95) / len(tail_95) if tail_95 else var_95

        # Parametric Skew-Normal Distribution Fitting
        skewnorm_params = {"a": skewness, "loc": mean_bias, "scale": std}
        if sp_stats is not None and np is not None:
            try:
                np_data = np.array(data, dtype=np.float64)
                a, loc, scale = sp_stats.skewnorm.fit(np_data)
                skewnorm_params = {"a": round(float(a), 4), "loc": round(float(loc), 2), "scale": round(float(scale), 2)}
            except Exception:
                pass

        # Kernel Density Estimation (KDE)
        min_x = min(data) - (0.2 * std)
        max_x = max(data) + (0.2 * std)
        x_grid = [min_x + i * (max_x - min_x) / (n_density_points - 1) for i in range(n_density_points)]
        
        density_points: list[dict[str, float]] = []
        if sp_stats is not None and np is not None:
            try:
                kde = sp_stats.gaussian_kde(data)
                densities = kde.evaluate(x_grid)
                density_points = [
                    {"error_mw": round(x, 1), "density": float(d)}
                    for x, d in zip(x_grid, densities)
                ]
            except Exception:
                density_points = self._silverman_kde_fallback(data, x_grid, std)
        else:
            density_points = self._silverman_kde_fallback(data, x_grid, std)

        return RiskMetrics(
            sample_size=n,
            mean_bias_mw=round(mean_bias, 2),
            mae_mw=round(mae, 2),
            rmse_mw=round(rmse, 2),
            std_mw=round(std, 2),
            skewness=round(skewness, 3),
            kurtosis=round(kurtosis, 3),
            var_90_mw=round(var_90, 2),
            var_95_mw=round(var_95, 2),
            var_99_mw=round(var_99, 2),
            cvar_95_mw=round(cvar_95, 2),
            skewnorm_params=skewnorm_params,
            density_points=density_points,
        )

    def _silverman_kde_fallback(
        self, data: list[float], x_grid: list[float], std: float
    ) -> list[dict[str, float]]:
        """Silverman's rule of thumb Gaussian KDE fallback (zero external deps)."""
        n = len(data)
        bandwidth = 1.06 * std * (n ** (-0.2)) if std > 0 else 100.0
        points = []
        factor = 1.0 / (math.sqrt(2 * math.pi) * bandwidth * n)
        two_h_sq = 2 * (bandwidth ** 2)

        for x in x_grid:
            dens = sum(math.exp(-((x - xi) ** 2) / two_h_sq) for xi in data) * factor
            points.append({"error_mw": round(x, 1), "density": float(dens)})
        return points

    def simulate_monte_carlo_dispatch(
        self,
        forecast_mw: float,
        portfolio_share_pct: float,
        firm_threshold_mw: float,
        iterations: int = 10000,
        random_seed: int = 42,
    ) -> dict[str, Any]:
        """Vectorized Monte Carlo simulation for utility reserve adequacy.

        Calculates:
        - Probability of Shortfall (realised generation < firm commitment)
        - Expected Energy Shortfall (MWh)
        - 95th Percentile Thermal Peaker Call (MW)
        """
        share = portfolio_share_pct / 100.0
        client_forecast = forecast_mw * share
        client_firm = firm_threshold_mw * share

        if np is not None:
            rng = np.random.default_rng(random_seed)
            # Sample residuals with replacement (empirical bootstrap)
            sampled_residuals = rng.choice(self.raw_residuals, size=iterations, replace=True)
            # Realised wind = Forecast - Residual
            realised_wind = np.maximum(0.0, client_forecast - (sampled_residuals * share))
            shortfalls = np.maximum(0.0, client_firm - realised_wind)
            shortfall_events = np.sum(shortfalls > 0)
            lolp = float(shortfall_events / iterations)
            mean_shortfall_mw = float(np.mean(shortfalls))
            p95_shortfall_mw = float(np.percentile(shortfalls, 95))
            p99_shortfall_mw = float(np.percentile(shortfalls, 99))
            max_shortfall_mw = float(np.max(shortfalls))
            expected_energy_unserved_mwh = round(mean_shortfall_mw * 24.0, 2)
        else:
            # Deterministic/random fallback
            import random
            rand = random.Random(random_seed)
            shortfalls = []
            for _ in range(iterations):
                r = rand.choice(self.raw_residuals)
                realised = max(0.0, client_forecast - (r * share))
                shortfalls.append(max(0.0, client_firm - realised))
            shortfalls.sort()
            lolp = sum(1 for s in shortfalls if s > 0) / iterations
            mean_shortfall_mw = sum(shortfalls) / iterations
            p95_shortfall_mw = shortfalls[int(0.95 * iterations)]
            p99_shortfall_mw = shortfalls[int(0.99 * iterations)]
            max_shortfall_mw = max(shortfalls)
            expected_energy_unserved_mwh = round(mean_shortfall_mw * 24.0, 2)

        return {
            "iterations": iterations,
            "forecast_mw": round(client_forecast, 2),
            "firm_threshold_mw": round(client_firm, 2),
            "loss_of_load_probability": round(lolp, 4),
            "mean_shortfall_mw": round(mean_shortfall_mw, 2),
            "p95_peaker_call_mw": round(p95_shortfall_mw, 2),
            "p99_peaker_call_mw": round(p99_shortfall_mw, 2),
            "max_shortfall_mw": round(max_shortfall_mw, 2),
            "expected_energy_unserved_mwh": expected_energy_unserved_mwh,
        }
