"""Pydantic models for the genomics pipeline *Run* entity.

A Run is the primary entity of this sample. It is persisted on B2 as
`runs/<run_id>/manifest.json` (B2 is the sole store — no database), and its
Nextflow log lives at `runs/<run_id>/nextflow.log`. The run's Nextflow `workDir`
and `--outdir` also live on B2 (`work/<run_id>/`, `results/<run_id>/`).
"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class RunStatus(StrEnum):
    """Lifecycle of a run. `blocked` is the graceful-degrade state used when the
    Nextflow binary or Java is unavailable — the app never crashes on a launch."""

    ready = "ready"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    blocked = "blocked"


class Pipeline(StrEnum):
    """Finite set of supported pipelines. `demo` is the bundled, Docker-free
    pipeline; the nf-core options are the documented realistic path."""

    demo = "demo"
    sarek = "nf-core/sarek"
    rnaseq = "nf-core/rnaseq"


class Profile(StrEnum):
    """Nextflow execution profile."""

    test = "test"
    docker = "docker"
    singularity = "singularity"
    standard = "standard"


class RunCreateRequest(BaseModel):
    """Create-run form payload. Selectors carry finite value sets; `name` is the
    only free-text field (a cohort label)."""

    name: str = Field(min_length=1, max_length=120)
    pipeline: Pipeline = Pipeline.demo
    profile: Profile = Profile.test
    # Object key of the chosen samplesheet under `inputs/` (discovered set).
    samplesheet: str | None = None


class RunManifest(BaseModel):
    """The full run record — exactly what is stored at runs/<run_id>/manifest.json.

    A launched run is an immutable execution record, which is why the UI omits an
    edit form (offering *Clone to new run* instead): the pipeline, samplesheet,
    and profile are fixed provenance of a job that has run against B2.
    """

    run_id: str
    name: str
    pipeline: Pipeline
    profile: Profile
    samplesheet: str | None = None
    status: RunStatus
    message: str | None = None
    command: str | None = None
    work_dir: str
    outdir: str
    exit_code: int | None = None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None


class StageSize(BaseModel):
    """Storage footprint of one B2 stage prefix for a run (or bucket-wide)."""

    stage: str
    prefix: str
    object_count: int
    size_bytes: int
    size_human: str


class RunDetail(BaseModel):
    """Run detail = manifest + the per-stage B2 storage breakdown."""

    manifest: RunManifest
    stages: list[StageSize]


class ResultArtifact(BaseModel):
    """One published output object under results/<run_id>/ (scoped explorer)."""

    key: str
    name: str
    category: str  # qc | align | variants | counts | other
    size_bytes: int
    size_human: str
    modified_at: datetime


class RunLog(BaseModel):
    run_id: str
    log: str
    present: bool


class GenomicsStats(BaseModel):
    """Dashboard aggregate over all runs + the data lake's stage storage."""

    total_runs: int
    ready: int
    running: int
    succeeded: int
    failed: int
    blocked: int
    result_artifacts: int
    storage: list[StageSize]
