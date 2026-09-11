"""CLI wrapper: seed the bucket with the bundled SYNTHETIC demo inputs.

Thin wrapper around `app.service.inputs.seed_demo_inputs` — the same function
the in-app "Seed demo inputs" action (`POST /runs/inputs/seed`) calls, so the
CLI and the UI path can never drift. Reads B2 credentials from the repo-root
`.env` exactly like the app. Never prints credentials.

The data is simulated — never real human genomic sequence.

Usage:
    python services/api/scripts/seed_inputs.py
"""

from __future__ import annotations

import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.config import settings  # noqa: E402
from app.service.inputs import NoBundledDataError, seed_demo_inputs  # noqa: E402


def out(message: str) -> None:
    sys.stdout.write(f"{message}\n")


def main() -> int:
    if not settings.b2_bucket_name:
        out("B2_BUCKET_NAME is not set — configure .env first.")
        return 2

    try:
        result = seed_demo_inputs()
    except NoBundledDataError as e:
        out(str(e))
        return 1

    for key in result.uploaded:
        out(f"uploaded {key}")
    out("\nSeed complete. Create a run, pick this samplesheet, and Launch.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
