"""Run control-plane orchestration.

Owns the Run lifecycle (create → ready → running → succeeded|failed|blocked),
the scoped Results explorer, per-stage storage accounting, and the dashboard
aggregate. B2 access is delegated to `repo.runs`; the Nextflow subprocess is
delegated to `service.nextflow`. No boto3 here.
"""

import logging
from datetime import UTC, datetime
from uuid import uuid4

from app.config import settings
from app.repo import runs as runs_repo
from app.service import nextflow
from app.types import (
    GenomicsStats,
    ResultArtifact,
    RunCreateRequest,
    RunDetail,
    RunLog,
    RunManifest,
    StageSize,
)

logger = logging.getLogger(__name__)

_CATEGORIES = ("qc", "align", "variants", "counts")
_EXT_CATEGORY = {
    ".vcf": "variants",
    ".tsv": "counts",
    ".json": "qc",
    ".sam": "align",
    ".bam": "align",
}


class RunNotFoundError(Exception):
    def __init__(self, detail: str = "Run not found"):
        self.detail = detail
        super().__init__(detail)


def _now() -> datetime:
    return datetime.now(UTC)


def _new_run_id() -> str:
    return f"{_now():%Y%m%d-%H%M%S}-{uuid4().hex[:6]}"


def create_run(req: RunCreateRequest) -> RunManifest:
    """Create a run in `ready` state and persist its manifest to B2."""
    run_id = _new_run_id()
    now = _now()
    bucket = settings.b2_bucket_name
    manifest = {
        "run_id": run_id,
        "name": req.name.strip(),
        "pipeline": req.pipeline.value,
        "profile": req.profile.value,
        "samplesheet": req.samplesheet or None,
        "status": "ready",
        "message": None,
        "command": None,
        "work_dir": f"s3://{bucket}/work/{run_id}",
        "outdir": f"s3://{bucket}/results/{run_id}",
        "exit_code": None,
        "created_at": now,
        "updated_at": now,
        "started_at": None,
        "finished_at": None,
    }
    runs_repo.write_manifest(manifest)
    logger.info("Run created: run_id=%s pipeline=%s", run_id, req.pipeline.value)
    return RunManifest(**manifest)


def list_runs() -> list[RunManifest]:
    manifests = runs_repo.list_manifests()
    manifests.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    return [RunManifest(**m) for m in manifests]


def _require_manifest(run_id: str) -> dict:
    manifest = runs_repo.read_manifest(run_id)
    if manifest is None:
        raise RunNotFoundError()
    return manifest


def _stage(stage: str, prefix: str) -> StageSize:
    count, size = runs_repo.stage_size(prefix)
    return StageSize(
        stage=stage,
        prefix=prefix,
        object_count=count,
        size_bytes=size,
        size_human=runs_repo.humanize(size),
    )


def get_run_detail(run_id: str) -> RunDetail:
    manifest = _require_manifest(run_id)
    stages = [
        _stage("runs", f"{runs_repo.RUNS_PREFIX}{run_id}/"),
        _stage("work", f"{runs_repo.WORK_PREFIX}{run_id}/"),
        _stage("results", f"{runs_repo.RESULTS_PREFIX}{run_id}/"),
    ]
    return RunDetail(manifest=RunManifest(**manifest), stages=stages)


def launch_run(run_id: str) -> RunManifest:
    """Transition a run to `running` and start Nextflow, or `blocked` if the
    engine is unavailable. Never crashes on a missing binary."""
    manifest = _require_manifest(run_id)
    if manifest.get("status") == "running":
        return RunManifest(**manifest)

    available, hint = nextflow.engine_status()
    now = _now()
    if not available:
        manifest.update(status="blocked", message=hint, updated_at=now)
        runs_repo.write_manifest(manifest)
        logger.info("Run blocked (engine unavailable): run_id=%s", run_id)
        return RunManifest(**manifest)

    manifest.update(
        status="running",
        message=None,
        started_at=now,
        finished_at=None,
        exit_code=None,
        updated_at=now,
    )
    runs_repo.write_manifest(manifest)
    nextflow.start_execution(run_id)
    logger.info("Run launched: run_id=%s", run_id)
    return RunManifest(**manifest)


def delete_run(run_id: str) -> int:
    """Delete a run and its scoped artifacts. Returns objects removed."""
    _require_manifest(run_id)
    removed = runs_repo.delete_run(run_id)
    logger.info("Run deleted: run_id=%s objects_removed=%d", run_id, removed)
    return removed


def get_run_log(run_id: str) -> RunLog:
    _require_manifest(run_id)
    log = runs_repo.read_log(run_id)
    return RunLog(run_id=run_id, log=log or "", present=log is not None)


def _categorize(key: str, run_id: str) -> str:
    rel = key[len(f"{runs_repo.RESULTS_PREFIX}{run_id}/") :]
    head = rel.split("/", 1)[0] if "/" in rel else ""
    if head in _CATEGORIES:
        return head
    for ext, cat in _EXT_CATEGORY.items():
        if key.lower().endswith(ext):
            return cat
    return "other"


def list_results(run_id: str) -> list[ResultArtifact]:
    _require_manifest(run_id)
    artifacts: list[ResultArtifact] = []
    for obj in runs_repo.list_results(run_id):
        key = obj["Key"]
        if key.endswith("/"):
            continue
        artifacts.append(
            ResultArtifact(
                key=key,
                name=key.rsplit("/", 1)[-1],
                category=_categorize(key, run_id),
                size_bytes=obj["Size"],
                size_human=runs_repo.humanize(obj["Size"]),
                modified_at=obj["LastModified"],
            )
        )
    artifacts.sort(key=lambda a: (a.category, a.name))
    return artifacts


def get_result_download_url(run_id: str, key: str) -> str:
    _require_manifest(run_id)
    filename = key.rsplit("/", 1)[-1]
    return runs_repo.presign_result(run_id, key, filename)


def list_input_sheets() -> list[str]:
    return runs_repo.list_input_sheets()


def get_stats() -> GenomicsStats:
    manifests = runs_repo.list_manifests()
    counts = {"ready": 0, "running": 0, "succeeded": 0, "failed": 0, "blocked": 0}
    for m in manifests:
        status = m.get("status", "ready")
        if status in counts:
            counts[status] += 1
    storage = [
        _stage("inputs", runs_repo.INPUTS_PREFIX),
        _stage("runs", runs_repo.RUNS_PREFIX),
        _stage("work", runs_repo.WORK_PREFIX),
        _stage("results", runs_repo.RESULTS_PREFIX),
    ]
    result_artifacts = next(
        (s.object_count for s in storage if s.stage == "results"), 0
    )
    return GenomicsStats(
        total_runs=len(manifests),
        result_artifacts=result_artifacts,
        storage=storage,
        **counts,
    )
