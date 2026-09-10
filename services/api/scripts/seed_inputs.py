"""Seed the bucket with the bundled SYNTHETIC demo inputs.

Uploads `pipelines/demo/data/*.fastq` to `inputs/fastq/` and writes a matching
samplesheet to `inputs/samplesheets/demo-samplesheet.csv` (with `s3://` FASTQ
paths so a launched Nextflow run stages them from B2). Reads B2 credentials from
the repo-root `.env` exactly like the app. Never prints credentials.

The data is simulated — never real human genomic sequence.

Usage:
    python services/api/scripts/seed_inputs.py
"""

from __future__ import annotations

import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = API_ROOT.parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.config import settings  # noqa: E402
from app.repo import upload_file  # noqa: E402

DATA_DIR = REPO_ROOT / "pipelines" / "demo" / "data"
FASTQ_PREFIX = "inputs/fastq/"
SHEET_KEY = "inputs/samplesheets/demo-samplesheet.csv"


def out(message: str) -> None:
    sys.stdout.write(f"{message}\n")


def main() -> int:
    if not settings.b2_bucket_name:
        out("B2_BUCKET_NAME is not set — configure .env first.")
        return 2
    fastqs = sorted(DATA_DIR.glob("*.fastq"))
    if not fastqs:
        out(f"No .fastq files found in {DATA_DIR}")
        return 1

    rows = ["sample,fastq"]
    for fastq in fastqs:
        key = f"{FASTQ_PREFIX}{fastq.name}"
        upload_file(fastq.read_bytes(), key, "text/plain")
        out(f"uploaded {key}")
        sample = fastq.stem
        rows.append(f"{sample},s3://{settings.b2_bucket_name}/{key}")

    sheet = ("\n".join(rows) + "\n").encode("utf-8")
    upload_file(sheet, SHEET_KEY, "text/csv")
    out(f"wrote samplesheet {SHEET_KEY} ({len(fastqs)} samples)")
    out("\nSeed complete. Create a run, pick this samplesheet, and Launch.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
