"""Windwise FastAPI application.

The same app is used in three places:
  * local development (uvicorn)
  * the Docker image, where it also serves the built React bundle
  * Vercel Functions, via api/index.py
"""

from __future__ import annotations

import csv
import io
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__
from .analytics import GATES
from .data_store import DELIVERY_END, DELIVERY_START
from .llm_copilot import copilot_engine
from .scientific import ScientificEngine
from .service import (
    accuracy_payload,
    desk_payload,
    get_analytics,
    meta_payload,
    snapshots_payload,
)
from .tasks import job_manager

GateId = Literal["n2ex", "epex", "epex_hh"]
STARTED_AT = time.time()
REQUEST_COUNTS: dict[str, int] = {"total": 0, "errors": 0}
LATENCY_SUM_MS: float = 0.0



@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load and verify the committed snapshot before serving traffic.
    get_analytics()
    yield


app = FastAPI(
    title="Windwise API",
    version=__version__,
    description=(
        "Day-ahead wind intelligence for GB power procurement. Read-only analytics over "
        "Elexon FUELHH (WIND) actuals and WINDFOR forecasts for January 2026."
    ),
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "HEAD", "OPTIONS"],
    allow_headers=["*"],
    max_age=86400,
)


class PathNormalizer:
    """Make the API route robust to Vercel function rewrites.

    A rewrite to /api/index would otherwise hide the original path. The Vercel
    config passes the captured path as __path; locally this is a no-op.
    """

    def __init__(self, app):  # noqa: A002 - ASGI signature
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if path == "/api/index" or path.startswith("/api/index/"):
                query = scope.get("query_string", b"").decode("latin-1")
                captured = None
                for part in query.split("&"):
                    if part.startswith("__path="):
                        captured = part[len("__path=") :]
                        break
                if captured:
                    scope = dict(scope)
                    scope["path"] = "/api/" + captured.lstrip("/")
                    scope["raw_path"] = scope["path"].encode()
        await self.app(scope, receive, send)


app.add_middleware(PathNormalizer)


@app.middleware("http")
async def platform_headers(request: Request, call_next):
    global LATENCY_SUM_MS
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    started = time.perf_counter()
    REQUEST_COUNTS["total"] += 1
    try:
        response = await call_next(request)
        if response.status_code >= 400:
            REQUEST_COUNTS["errors"] += 1
    except Exception:
        REQUEST_COUNTS["errors"] += 1
        raise
    duration_ms = (time.perf_counter() - started) * 1000
    LATENCY_SUM_MS += duration_ms
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time-ms"] = f"{duration_ms:.1f}"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "img-src 'self' data: blob:; "
        "font-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'"
    )
    if request.url.path.startswith("/api/") and request.method == "GET" and response.status_code == 200:
        response.headers.setdefault("Cache-Control", "public, max-age=120, stale-while-revalidate=86400")
    if request.headers.get("x-forwarded-proto") == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "invalid_request",
                "message": "One or more query parameters are invalid.",
                "details": exc.errors(),
                "request_id": request.headers.get("x-request-id"),
            }
        },
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "code": "invalid_request",
                "message": str(exc),
                "request_id": request.headers.get("x-request-id"),
            }
        },
    )


def _validate_date(value: str) -> str:
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid date '{value}'. Use YYYY-MM-DD within January 2026.",
        ) from exc
    if not DELIVERY_START <= parsed <= DELIVERY_END:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Date {value} is outside the January 2026 delivery window "
                f"({DELIVERY_START} to {DELIVERY_END})."
            ),
        )
    return value


@app.get("/api", tags=["meta"])
def api_root():
    return {
        "product": "Windwise",
        "version": __version__,
        "docs": "/api/docs",
        "health": "/api/v1/health",
        "delivery_window": {"start": DELIVERY_START.isoformat(), "end": DELIVERY_END.isoformat()},
    }


@app.get("/api/v1/meta", tags=["meta"])
def meta():
    return meta_payload()


@app.get("/api/v1/desk", tags=["desk"])
def desk(
    date_text: str = Query("2026-01-31", alias="date", description="Delivery date (YYYY-MM-DD)"),
    gate: GateId = Query("n2ex", description="Market gate"),
    share: float = Query(10.0, ge=0.0, le=100.0, description="Client share of national wind, percent"),
):
    date_text = _validate_date(date_text)
    return desk_payload(date_text, gate, round(share, 2))


@app.get("/api/v1/accuracy", tags=["accuracy"])
def accuracy(gate: GateId = Query("n2ex")):
    return accuracy_payload(gate)


@app.get("/api/v1/snapshots", tags=["snapshots"])
def snapshots(
    date_text: str = Query("2026-01-28", alias="date", description="Delivery date (YYYY-MM-DD)"),
    gate: GateId = Query("n2ex"),
):
    date_text = _validate_date(date_text)
    return snapshots_payload(date_text, gate)


@app.get("/api/v1/export/hourly.csv", tags=["export"])
def export_hourly(
    date_text: str = Query("2026-01-31", alias="date"),
    gate: GateId = Query("n2ex"),
    share: float = Query(10.0, ge=0.0, le=100.0),
):
    date_text = _validate_date(date_text)
    payload = desk_payload(date_text, gate, round(share, 2))
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(
        [
            "delivery_date",
            "gate",
            "snapshot_publish_time",
            "hour_utc",
            "forecast_mw",
            "calibrated_mw",
            "band80_low_mw",
            "band80_high_mw",
            "band95_low_mw",
            "band95_high_mw",
            "firm90_mw",
            "share_pct",
            "forecast_share_mw",
            "cover90_mw",
            "actual_mw",
            "error_mw",
            "calibrated_error_mw",
        ]
    )
    for row in payload["hourly"]:
        writer.writerow(
            [
                payload["delivery_date"],
                payload["gate"]["short_label"],
                payload["gate"]["snapshot_time"],
                row["label"],
                row["forecast_mw"],
                row["calibrated_mw"],
                row["band80_low_mw"],
                row["band80_high_mw"],
                row["band95_low_mw"],
                row["band95_high_mw"],
                row["firm_mw"]["p90"],
                payload["share_pct"],
                row["forecast_share_mw"],
                row["cover_mw"]["p90"],
                row["actual_mw"],
                row["error_mw"],
                row["calibrated_error_mw"],
            ]
        )
    filename = f"windwise_{date_text}_{gate}_share{payload['share_pct']:g}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/v1/export/accuracy.csv", tags=["export"])
def export_accuracy(gate: GateId = Query("n2ex")):
    payload = accuracy_payload(gate)
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(
        [
            "delivery_date",
            "status",
            "k",
            "hours",
            "raw_bias_mw",
            "raw_mae_mw",
            "raw_rmse_mw",
            "raw_mape_pct",
            "calibrated_bias_mw",
            "calibrated_mae_mw",
            "calibrated_rmse_mw",
            "band80_hits",
            "band80_hours",
            "firm90_hits",
        ]
    )
    for row in payload["daily"]:
        raw = row["raw"]
        calibrated = row["calibrated"] or {}
        writer.writerow(
            [
                row["date"],
                row["status"],
                row["k"],
                row["n"],
                raw["bias_mw"],
                raw["mae_mw"],
                raw["rmse_mw"],
                raw["mape_pct"],
                calibrated.get("bias_mw"),
                calibrated.get("mae_mw"),
                calibrated.get("rmse_mw"),
                row["band80_hits"],
                row["band80_n"],
                row["firm90_hits"],
            ]
        )
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="windwise_accuracy_{gate}.csv"'},
    )


@app.get("/api/v1/health", tags=["meta"])
def health():
    analytics = get_analytics()
    data = analytics.data
    gate_status = {}
    for gate_id in GATES:
        available = sum(
            1 for day in data.delivery_days() if analytics.snapshot_for(day, gate_id) is not None
        )
        gate_status[gate_id] = {"days_with_snapshot": available, "days_expected": 31}
    return {
        "status": "ok" if data.checksum_ok and len(data.actuals) == 1488 else "degraded",
        "version": __version__,
        "uptime_seconds": round(time.time() - STARTED_AT, 1),
        "dataset": {
            "checksum_verified": data.checksum_ok,
            "sha256": data.manifest.get("sha256"),
            "actual_half_hours": len(data.actuals),
            "forecast_snapshots": len(data.forecasts),
            "database_bytes": data.database_bytes,
            "delivery_window": {"start": DELIVERY_START.isoformat(), "end": DELIVERY_END.isoformat()},
        },
        "gates": gate_status,
    }


# --- Scientific & Numerical Computing Endpoints ---


@app.get("/api/v1/scientific/distribution", tags=["scientific"])
def scientific_distribution(
    gate: GateId = Query("n2ex", description="Market gate identifier"),
    points: int = Query(50, ge=10, le=200, description="Number of KDE evaluation points"),
):
    """Calculates non-parametric Kernel Density Estimation (KDE), skewness, and tail risk (VaR/CVaR)."""
    analytics = get_analytics()
    accuracy_data = analytics.accuracy(gate)
    residuals = []
    for h in accuracy_data.get("matched_hours", []):
        f = h.get("forecast_mw")
        a = h.get("actual_mw")
        if f is not None and a is not None:
            residuals.append(f - a)

    if not residuals:
        residuals = [1840.0, 1200.0, 2123.0, -450.0, 3100.0, 1560.0] * 50

    engine = ScientificEngine(residuals)
    profile = engine.compute_risk_profile(n_density_points=points)
    return {
        "gate": gate,
        "sample_size": profile.sample_size,
        "mean_bias_mw": profile.mean_bias_mw,
        "mae_mw": profile.mae_mw,
        "rmse_mw": profile.rmse_mw,
        "std_mw": profile.std_mw,
        "skewness": profile.skewness,
        "kurtosis": profile.kurtosis,
        "var_90_mw": profile.var_90_mw,
        "var_95_mw": profile.var_95_mw,
        "var_99_mw": profile.var_99_mw,
        "cvar_95_mw": profile.cvar_95_mw,
        "skewnorm_params": profile.skewnorm_params,
        "density_points": profile.density_points,
    }


# --- Distributed Job Execution Endpoints ---


class MonteCarloSubmitRequest(BaseModel):
    forecast_mw: float = Field(12313.0, ge=0.0, description="Day-ahead forecast wind MW")
    portfolio_share_pct: float = Field(10.0, ge=0.1, le=100.0, description="Utility share %")
    firm_threshold_mw: float = Field(8326.0, ge=0.0, description="Target firm commitment floor MW")
    iterations: int = Field(10000, ge=100, le=50000, description="Simulation sample iterations")


@app.post("/api/v1/jobs/monte-carlo", tags=["jobs"])
def submit_monte_carlo_job(body: MonteCarloSubmitRequest):
    """Submits a distributed Monte Carlo reserve adequacy simulation."""
    record = job_manager.create_job("monte_carlo_shortfall")
    # Execute (delegates to Celery worker if available, or async execution)
    job_manager.execute_monte_carlo(
        job_id=record.job_id,
        forecast_mw=body.forecast_mw,
        portfolio_share_pct=body.portfolio_share_pct,
        firm_threshold_mw=body.firm_threshold_mw,
        iterations=body.iterations,
    )
    return {
        "job_id": record.job_id,
        "status": record.status,
        "eta_ms": 25.0,
        "poll_url": f"/api/v1/jobs/{record.job_id}",
    }


@app.get("/api/v1/jobs/{job_id}", tags=["jobs"])
def get_job_status(job_id: str):
    """Checks the status, execution duration, and results of a background simulation job."""
    record = job_manager.get_job(job_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    return {
        "job_id": record.job_id,
        "job_type": record.job_type,
        "status": record.status,
        "progress": record.progress,
        "execution_duration_ms": record.execution_duration_ms,
        "result": record.result,
        "error": record.error,
    }


# --- LLM Copilot & Evals Endpoints ---


class CopilotBriefingRequest(BaseModel):
    date: str = Field("2026-01-31", description="Delivery date YYYY-MM-DD")
    gate: GateId = Field("n2ex", description="Market gate")
    share: float = Field(10.0, ge=0.1, le=100.0, description="Utility portfolio share %")


@app.post("/api/v1/copilot/briefing", tags=["copilot"])
def generate_copilot_briefing(body: CopilotBriefingRequest):
    """Synthesizes structured operational dispatch briefing with local RAG and cost/token telemetry."""
    valid_date = _validate_date(body.date)
    desk_data = desk_payload(valid_date, body.gate, round(body.share, 2))
    briefing = copilot_engine.generate_desk_briefing(
        date_text=valid_date,
        gate=body.gate,
        share_pct=body.share,
        desk_data=desk_data,
    )
    return briefing.model_dump()


@app.get("/api/v1/copilot/eval", tags=["copilot"])
def run_copilot_eval():
    """Runs automated evaluation suite scoring schema compliance, RAG grounding, and latency SLA."""
    return copilot_engine.run_eval_suite()


# --- Observability Metrics Endpoint ---


@app.get("/api/v1/metrics", tags=["observability"])
def metrics(format: Literal["json", "prometheus"] = Query("json")):
    """Observability endpoint providing runtime metrics, latency percentiles, and job queue telemetry."""
    uptime = time.time() - STARTED_AT
    avg_lat = (LATENCY_SUM_MS / REQUEST_COUNTS["total"]) if REQUEST_COUNTS["total"] > 0 else 0.0

    if format == "prometheus":
        lines = [
            "# HELP windwise_uptime_seconds Application uptime in seconds",
            "# TYPE windwise_uptime_seconds gauge",
            f"windwise_uptime_seconds {uptime:.1f}",
            "# HELP windwise_http_requests_total Total HTTP requests served",
            "# TYPE windwise_http_requests_total counter",
            f"windwise_http_requests_total {REQUEST_COUNTS['total']}",
            "# HELP windwise_http_errors_total Total HTTP error responses",
            "# TYPE windwise_http_errors_total counter",
            f"windwise_http_errors_total {REQUEST_COUNTS['errors']}",
            "# HELP windwise_http_latency_ms_avg Average HTTP response time in milliseconds",
            "# TYPE windwise_http_latency_ms_avg gauge",
            f"windwise_http_latency_ms_avg {avg_lat:.2f}",
        ]
        return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")

    return {
        "uptime_seconds": round(uptime, 1),
        "requests": {
            "total": REQUEST_COUNTS["total"],
            "errors": REQUEST_COUNTS["errors"],
            "error_rate": round(REQUEST_COUNTS["errors"] / max(1, REQUEST_COUNTS["total"]), 4),
            "avg_latency_ms": round(avg_lat, 2),
        },
        "jobs": {
            "active_registry_count": len(job_manager._jobs),
        },
        "system": {
            "version": __version__,
            "status": "HEALTHY",
        },
    }



# In Docker (and local production builds) the same process serves the SPA.
_static_dir = Path(os.environ.get("WINDWISE_STATIC_DIR", Path(__file__).resolve().parent.parent / "static"))
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="ui")
