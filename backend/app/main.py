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
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .analytics import GATES
from .data_store import DELIVERY_END, DELIVERY_START
from .service import (
    accuracy_payload,
    desk_payload,
    get_analytics,
    meta_payload,
    snapshots_payload,
)

GateId = Literal["n2ex", "epex", "epex_hh"]
STARTED_AT = time.time()


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
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time-ms"] = f"{(time.perf_counter() - started) * 1000:.1f}"
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


# In Docker (and local production builds) the same process serves the SPA.
_static_dir = Path(os.environ.get("WINDWISE_STATIC_DIR", Path(__file__).resolve().parent.parent / "static"))
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="ui")
