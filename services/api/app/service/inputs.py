"""Seed the bucket with the bundled SYNTHETIC demo genomics inputs.

Shared by the CLI script (`services/api/scripts/seed_inputs.py`) and the
`POST /runs/inputs/seed` endpoint (the in-app "Seed demo inputs" action), so a
UI-only user has the same one-click path to a usable samplesheet as the
documented CLI flow — see docs/features/genomics-ingest.md.

Uploads `pipelines/demo/data/*.fastq` to `inputs/fastq/` and writes a matching
samplesheet to `inputs/samplesheets/demo-samplesheet.csv` (with `s3://` FASTQ
paths so a launched Nextflow run stages them from B2).

The data is simulated — never real human genomic sequence.
"""

import logging
from pathlib import Path

from app.config import settings
from app.repo import upload_file
from app.types import SeedInputsResponse

logger = logging.getLogger(__name__)

# services/api/app/service/inputs.py -> parents[4] == repo root.
_REPO_ROOT = Path(__file__).resolve().parents[4]
_DEMO_DATA_DIR = _REPO_ROOT / "pipelines" / "demo" / "data"
FASTQ_PREFIX = "inputs/fastq/"
SAMPLESHEET_KEY = "inputs/samplesheets/demo-samplesheet.csv"


class NoBundledDataError(Exception):
    """Raised when the bundled demo FASTQ files are missing from the checkout."""


def seed_demo_inputs() -> SeedInputsResponse:
    """Upload the bundled synthetic FASTQ + a generated samplesheet to B2.

    Idempotent: re-running overwrites the same keys with the same content, so
    it is safe to call from the UI more than once. Raises NoBundledDataError if
    the repo's demo data is missing, or RuntimeError on a B2 write failure
    (propagated from `upload_file`).
    """
    fastqs = sorted(_DEMO_DATA_DIR.glob("*.fastq"))
    if not fastqs:
        raise NoBundledDataError(f"No .fastq files found in {_DEMO_DATA_DIR}")

    uploaded: list[str] = []
    rows = ["sample,fastq"]
    for fastq in fastqs:
        key = f"{FASTQ_PREFIX}{fastq.name}"
        upload_file(fastq.read_bytes(), key, "text/plain")
        uploaded.append(key)
        rows.append(f"{fastq.stem},s3://{settings.b2_bucket_name}/{key}")

    sheet = ("\n".join(rows) + "\n").encode("utf-8")
    upload_file(sheet, SAMPLESHEET_KEY, "text/csv")
    uploaded.append(SAMPLESHEET_KEY)
    logger.info("Seeded demo inputs: %d fastq(s) + samplesheet", len(fastqs))
    return SeedInputsResponse(
        uploaded=uploaded, samplesheet=SAMPLESHEET_KEY, sample_count=len(fastqs)
    )
