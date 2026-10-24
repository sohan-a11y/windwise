"""Vercel function entrypoint.

Vercel's Python runtime looks for a FastAPI instance named ``app``. The backend
package lives in ``backend/`` so that Docker and Vercel can share exactly the
same code.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.main import app  # noqa: E402,F401
