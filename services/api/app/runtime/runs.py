"""HTTP routes for the Run control plane.

Sync handlers (blocking boto3 downstream) run in Starlette's threadpool, matching
the files router. No business logic here — everything delegates to service.runs.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.service import runs as runs_service
from app.service.runs import RunNotFoundError
from app.types import (
    GenomicsStats,
    ResultArtifact,
    RunCreateRequest,
    RunDetail,
    RunLog,
    RunManifest,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# SECURITY: like the files routes, these are intentionally unauthenticated and
# bucket-wide (single-tenant demo stance — see docs/SECURITY.md). A multi-tenant
# clone must add auth to every route AND scope runs to the caller's own prefixes.


def _storage_error() -> HTTPException:
    return HTTPException(status_code=502, detail="Storage backend error")


# --- static routes first so they are not captured by /runs/{run_id} ---------


@router.get("/runs", response_model=list[RunManifest])
def list_runs_endpoint():
    try:
        return runs_service.list_runs()
    except RuntimeError:
        raise _storage_error() from None


@router.post("/runs", response_model=RunManifest)
def create_run_endpoint(req: RunCreateRequest):
    try:
        return runs_service.create_run(req)
    except RuntimeError:
        raise _storage_error() from None


@router.get("/runs/inputs", response_model=list[str])
def list_input_sheets_endpoint():
    """Discovered samplesheet keys under inputs/ (populates the create form)."""
    try:
        return runs_service.list_input_sheets()
    except RuntimeError:
        raise _storage_error() from None


@router.get("/runs/stats", response_model=GenomicsStats)
def run_stats_endpoint():
    try:
        return runs_service.get_stats()
    except RuntimeError:
        raise _storage_error() from None


# --- run-scoped routes -------------------------------------------------------


@router.get("/runs/{run_id}", response_model=RunDetail)
def get_run_endpoint(run_id: str):
    try:
        return runs_service.get_run_detail(run_id)
    except RunNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except RuntimeError:
        raise _storage_error() from None


@router.post("/runs/{run_id}/launch", response_model=RunManifest)
def launch_run_endpoint(run_id: str):
    try:
        return runs_service.launch_run(run_id)
    except RunNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except RuntimeError:
        raise _storage_error() from None


@router.delete("/runs/{run_id}")
def delete_run_endpoint(run_id: str):
    try:
        removed = runs_service.delete_run(run_id)
    except RunNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except RuntimeError:
        raise _storage_error() from None
    return {"deleted": True, "run_id": run_id, "objects_removed": removed}


@router.get("/runs/{run_id}/log", response_model=RunLog)
def get_run_log_endpoint(run_id: str):
    try:
        return runs_service.get_run_log(run_id)
    except RunNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except RuntimeError:
        raise _storage_error() from None


@router.get("/runs/{run_id}/results", response_model=list[ResultArtifact])
def list_results_endpoint(run_id: str):
    try:
        return runs_service.list_results(run_id)
    except RunNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except RuntimeError:
        raise _storage_error() from None


@router.get("/runs/{run_id}/results/download")
def download_result_endpoint(run_id: str, key: str):
    try:
        url = runs_service.get_result_download_url(run_id, key)
    except RunNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from None
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None
    except RuntimeError:
        raise _storage_error() from None
    return {"url": url}
