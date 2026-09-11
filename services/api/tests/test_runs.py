"""Tests for the Run control plane.

Hermetic: the B2 repo boundary and the Nextflow subprocess are both mocked, so
`pnpm verify` never touches B2 or shells out to Nextflow/Java.
"""

from datetime import UTC, datetime

import pytest
from botocore.exceptions import ClientError

from app.repo import runs as runs_repo
from app.service import nextflow
from app.service import runs as runs_service


def _ready_manifest(run_id: str = "20260101-000000-abc123") -> dict:
    now = datetime.now(UTC)
    return {
        "run_id": run_id,
        "name": "cohort-demo",
        "pipeline": "demo",
        "profile": "test",
        "samplesheet": "inputs/samplesheets/demo-samplesheet.csv",
        "status": "ready",
        "message": None,
        "command": None,
        "work_dir": f"s3://bucket/work/{run_id}",
        "outdir": f"s3://bucket/results/{run_id}",
        "exit_code": None,
        "created_at": now,
        "updated_at": now,
        "started_at": None,
        "finished_at": None,
    }


@pytest.mark.asyncio
async def test_create_run_returns_ready(client, monkeypatch):
    written = {}
    monkeypatch.setattr(runs_repo, "write_manifest", lambda m: written.update(m))

    resp = await client.post(
        "/runs", json={"name": "cohort-x", "pipeline": "demo", "profile": "test"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["name"] == "cohort-x"
    # workDir is LOCAL (the bundled pipeline's LOCAL executor requires a POSIX
    # path); outdir (results) stays on B2.
    assert not body["work_dir"].startswith("s3://")
    assert body["work_dir"].endswith(f"/{body['run_id']}/work")
    assert body["outdir"].startswith("s3://")
    assert written["status"] == "ready"


@pytest.mark.asyncio
async def test_create_run_rejects_bad_pipeline(client):
    resp = await client.post(
        "/runs", json={"name": "x", "pipeline": "not-a-pipeline", "profile": "test"}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_launch_blocks_without_engine(client, monkeypatch):
    manifest = _ready_manifest()
    saved = {}
    monkeypatch.setattr(runs_repo, "read_manifest", lambda rid: dict(manifest))
    monkeypatch.setattr(runs_repo, "write_manifest", lambda m: saved.update(m))
    monkeypatch.setattr(
        nextflow, "engine_status", lambda: (False, "Nextflow not found on PATH.")
    )

    resp = await client.post(f"/runs/{manifest['run_id']}/launch")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "blocked"
    assert "Nextflow" in body["message"]
    assert saved["status"] == "blocked"


@pytest.mark.asyncio
async def test_launch_runs_with_engine(client, monkeypatch):
    manifest = _ready_manifest()
    started = {}
    monkeypatch.setattr(runs_repo, "read_manifest", lambda rid: dict(manifest))
    monkeypatch.setattr(runs_repo, "write_manifest", lambda m: None)
    monkeypatch.setattr(nextflow, "engine_status", lambda: (True, ""))
    monkeypatch.setattr(
        nextflow, "start_execution", lambda rid: started.update({"run_id": rid})
    )

    resp = await client.post(f"/runs/{manifest['run_id']}/launch")
    assert resp.status_code == 200
    assert resp.json()["status"] == "running"
    assert started["run_id"] == manifest["run_id"]


@pytest.mark.asyncio
async def test_launch_missing_run_404(client, monkeypatch):
    monkeypatch.setattr(runs_repo, "read_manifest", lambda rid: None)
    resp = await client.post("/runs/nope/launch")
    assert resp.status_code == 404


def test_execute_run_marks_succeeded(monkeypatch, tmp_path):
    manifest = _ready_manifest()
    manifest["status"] = "running"
    saves = []
    monkeypatch.setattr(runs_repo, "read_manifest", lambda rid: dict(manifest))
    monkeypatch.setattr(runs_repo, "write_manifest", lambda m: saves.append(dict(m)))
    monkeypatch.setattr(runs_repo, "write_log", lambda rid, text: None)
    monkeypatch.setattr(nextflow, "_scratch_dir", lambda rid: tmp_path)
    monkeypatch.setattr(nextflow, "run_subprocess", lambda cmd, cwd: (0, "N E X T F L O W\nDone.\n"))

    nextflow.execute_run(manifest["run_id"])
    assert saves, "expected a manifest write"
    assert saves[-1]["status"] == "succeeded"
    assert saves[-1]["exit_code"] == 0
    assert saves[-1]["finished_at"] is not None


def test_execute_run_marks_failed_on_nonzero(monkeypatch, tmp_path):
    manifest = _ready_manifest()
    manifest["status"] = "running"
    saves = []
    monkeypatch.setattr(runs_repo, "read_manifest", lambda rid: dict(manifest))
    monkeypatch.setattr(runs_repo, "write_manifest", lambda m: saves.append(dict(m)))
    monkeypatch.setattr(runs_repo, "write_log", lambda rid, text: None)
    monkeypatch.setattr(nextflow, "_scratch_dir", lambda rid: tmp_path)
    monkeypatch.setattr(nextflow, "run_subprocess", lambda cmd, cwd: (1, "error\n"))

    nextflow.execute_run(manifest["run_id"])
    assert saves[-1]["status"] == "failed"
    assert saves[-1]["exit_code"] == 1
    assert saves[-1]["message"]


@pytest.mark.asyncio
async def test_delete_run_scoped(client, monkeypatch):
    manifest = _ready_manifest()
    monkeypatch.setattr(runs_repo, "read_manifest", lambda rid: dict(manifest))
    monkeypatch.setattr(runs_repo, "delete_run", lambda rid: 7)

    resp = await client.delete(f"/runs/{manifest['run_id']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["deleted"] is True
    assert body["objects_removed"] == 7


@pytest.mark.asyncio
async def test_results_download_rejects_out_of_scope_key(client, monkeypatch):
    manifest = _ready_manifest()
    monkeypatch.setattr(runs_repo, "read_manifest", lambda rid: dict(manifest))

    # Key belonging to another run must be rejected (400), never presigned.
    resp = await client.get(
        f"/runs/{manifest['run_id']}/results/download",
        params={"key": "results/some-other-run/qc/x.json"},
    )
    assert resp.status_code == 400


def test_delete_run_only_touches_scoped_prefixes(monkeypatch):
    """Regression guard: delete_run must scope to runs/<id>/, work/<id>/,
    results/<id>/ only — never inputs/ or another run."""
    run_id = "20260101-000000-abc123"
    listed_prefixes = []
    deleted_keys = []

    def fake_paginate(prefix):
        listed_prefixes.append(prefix)
        return [{"Key": f"{prefix}file.txt", "Size": 1}]

    monkeypatch.setattr(runs_repo, "_paginate", fake_paginate)
    monkeypatch.setattr(runs_repo, "_delete_keys", lambda keys: deleted_keys.extend(keys) or len(keys))
    monkeypatch.setattr(runs_repo, "_invalidate_list_cache", lambda: None)

    runs_repo.delete_run(run_id)
    assert set(listed_prefixes) == {
        f"runs/{run_id}/",
        f"work/{run_id}/",
        f"results/{run_id}/",
    }
    assert all(run_id in key for key in deleted_keys)
    assert not any(key.startswith("inputs/") for key in deleted_keys)


# --- run-detail progress bar: expected_artifacts ----------------------------


def test_get_run_detail_expected_artifacts_demo_pipeline(monkeypatch):
    manifest = _ready_manifest()
    monkeypatch.setattr(runs_repo, "read_manifest", lambda rid: dict(manifest))
    monkeypatch.setattr(runs_repo, "stage_size", lambda prefix: (0, 0))
    monkeypatch.setattr(runs_repo, "read_samplesheet_row_count", lambda key: 2)

    detail = runs_service.get_run_detail(manifest["run_id"])

    # 2 samples x 4 demo stages (qc/align/variants/counts).
    assert detail.expected_artifacts == 8


def test_get_run_detail_expected_artifacts_none_without_samplesheet(monkeypatch):
    manifest = _ready_manifest()
    manifest["samplesheet"] = None
    monkeypatch.setattr(runs_repo, "read_manifest", lambda rid: dict(manifest))
    monkeypatch.setattr(runs_repo, "stage_size", lambda prefix: (0, 0))

    detail = runs_service.get_run_detail(manifest["run_id"])

    assert detail.expected_artifacts is None


def test_get_run_detail_expected_artifacts_none_for_non_demo_pipeline(monkeypatch):
    manifest = _ready_manifest()
    manifest["pipeline"] = "nf-core/sarek"
    monkeypatch.setattr(runs_repo, "read_manifest", lambda rid: dict(manifest))
    monkeypatch.setattr(runs_repo, "stage_size", lambda prefix: (0, 0))

    detail = runs_service.get_run_detail(manifest["run_id"])

    # Stage count for a non-demo pipeline is unknown — never guess.
    assert detail.expected_artifacts is None


def test_get_run_detail_expected_artifacts_none_when_samplesheet_unreadable(
    monkeypatch,
):
    manifest = _ready_manifest()
    monkeypatch.setattr(runs_repo, "read_manifest", lambda rid: dict(manifest))
    monkeypatch.setattr(runs_repo, "stage_size", lambda prefix: (0, 0))
    monkeypatch.setattr(runs_repo, "read_samplesheet_row_count", lambda key: None)

    detail = runs_service.get_run_detail(manifest["run_id"])

    assert detail.expected_artifacts is None


class _FakeBody:
    def __init__(self, data: bytes):
        self._data = data

    def read(self):
        return self._data


class _FakeS3Object:
    """Fake S3 client serving a single canned get_object response or error."""

    def __init__(self, body: bytes | None = None, missing: bool = False):
        self._body = body
        self._missing = missing

    def get_object(self, **kwargs):
        if self._missing:
            raise ClientError({"Error": {"Code": "404"}}, "GetObject")
        return {"Body": _FakeBody(self._body)}


def test_read_samplesheet_row_count_counts_data_rows(monkeypatch):
    csv_bytes = (
        b"sample,fastq\n"
        b"sample_a,s3://bucket/inputs/fastq/sample_a.fastq\n"
        b"sample_b,s3://bucket/inputs/fastq/sample_b.fastq\n"
    )
    monkeypatch.setattr(runs_repo, "get_s3_client", lambda: _FakeS3Object(csv_bytes))

    assert (
        runs_repo.read_samplesheet_row_count("inputs/samplesheets/x.csv") == 2
    )


def test_read_samplesheet_row_count_missing_object_returns_none(monkeypatch):
    monkeypatch.setattr(runs_repo, "get_s3_client", lambda: _FakeS3Object(missing=True))

    assert runs_repo.read_samplesheet_row_count("inputs/samplesheets/x.csv") is None


def test_read_samplesheet_row_count_header_only_returns_none(monkeypatch):
    monkeypatch.setattr(
        runs_repo, "get_s3_client", lambda: _FakeS3Object(b"sample,fastq\n")
    )

    assert runs_repo.read_samplesheet_row_count("inputs/samplesheets/x.csv") is None
