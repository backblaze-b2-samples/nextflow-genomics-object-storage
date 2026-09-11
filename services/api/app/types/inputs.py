"""Pydantic model for the bundled demo input-seeding action.

Shared by `POST /runs/inputs/seed` (the in-app "Seed demo inputs" action) and the
CLI script `services/api/scripts/seed_inputs.py`, both of which call
`app.service.inputs.seed_demo_inputs`.
"""

from pydantic import BaseModel


class SeedInputsResponse(BaseModel):
    """Result of uploading the bundled synthetic FASTQ + samplesheet to B2."""

    uploaded: list[str]
    samplesheet: str
    sample_count: int
