"""Destination-prefix routing for direct-to-B2 uploads.

Genomics-ingest uploads (the /upload page) route samplesheets and FASTQ
reads into the same inputs/ tree the demo seed script and the create-run
samplesheet scan already read (scripts/seed_inputs.py,
repo/runs.py::list_input_sheets) instead of the generic, junk-bearing
uploads/ prefix — so a samplesheet a user uploads becomes selectable in
Create Run automatically. Everything else keeps the generic prefix.
"""

UPLOAD_PREFIX = "uploads/"
INPUT_SAMPLESHEET_PREFIX = "inputs/samplesheets/"
INPUT_FASTQ_PREFIX = "inputs/fastq/"
UPLOAD_PREFIXES = (UPLOAD_PREFIX, INPUT_SAMPLESHEET_PREFIX, INPUT_FASTQ_PREFIX)

_EXT_PREFIX = {
    "csv": INPUT_SAMPLESHEET_PREFIX,
    "tsv": INPUT_SAMPLESHEET_PREFIX,
    "fastq": INPUT_FASTQ_PREFIX,
    "fasta": INPUT_FASTQ_PREFIX,
}


def destination_prefix(safe_name: str) -> str:
    """Object prefix for a sanitized filename, chosen by extension."""
    ext = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else ""
    return _EXT_PREFIX.get(ext, UPLOAD_PREFIX)
