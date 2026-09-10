"""B2 persistence for genomics pipeline runs — the sole data store.

All boto3 access for the Run entity is confined here (structural invariant:
no boto3 outside repo/). Manifests, logs, result artifacts, and scoped deletes
are all object operations over the S3-compatible API.

Prefix layout on the bucket:
    inputs/    FASTQ + samplesheets (ingest)
    runs/      <run_id>/manifest.json, <run_id>/nextflow.log
    work/      <run_id>/  Nextflow workDir (staged intermediates)
    results/   <run_id>/{qc,align,variants,counts}/  published outputs
"""

import json

from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings
from app.repo.b2_client import get_presigned_url, get_s3_client
from app.repo.list_cache import invalidate as _invalidate_list_cache
from app.types.formatting import humanize_bytes

RUNS_PREFIX = "runs/"
WORK_PREFIX = "work/"
RESULTS_PREFIX = "results/"
INPUTS_PREFIX = "inputs/"
_MANIFEST_SUFFIX = "/manifest.json"
_SHEET_SUFFIXES = (".csv", ".tsv")


def _manifest_key(run_id: str) -> str:
    return f"{RUNS_PREFIX}{run_id}{_MANIFEST_SUFFIX}"


def _log_key(run_id: str) -> str:
    return f"{RUNS_PREFIX}{run_id}/nextflow.log"


def _paginate(prefix: str) -> list[dict]:
    """Every object under `prefix`, read fresh (runs change often, so this does
    not use the shared full-bucket cache). Raises RuntimeError on S3 failure."""
    client = get_s3_client()
    contents: list[dict] = []
    kwargs: dict = {"Bucket": settings.b2_bucket_name, "Prefix": prefix, "MaxKeys": 1000}
    try:
        while True:
            resp = client.list_objects_v2(**kwargs)
            contents.extend(resp.get("Contents", []))
            if not resp.get("IsTruncated"):
                break
            kwargs["ContinuationToken"] = resp["NextContinuationToken"]
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 list failed for '{prefix}': {e}") from e
    return contents


def write_manifest(manifest: dict) -> None:
    """Persist a run manifest to runs/<run_id>/manifest.json."""
    client = get_s3_client()
    body = json.dumps(manifest, indent=2, default=str).encode("utf-8")
    try:
        client.put_object(
            Bucket=settings.b2_bucket_name,
            Key=_manifest_key(manifest["run_id"]),
            Body=body,
            ContentType="application/json",
        )
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 manifest write failed: {e}") from e
    _invalidate_list_cache()


def read_manifest(run_id: str) -> dict | None:
    """Read a run manifest, or None if it does not exist."""
    client = get_s3_client()
    try:
        resp = client.get_object(
            Bucket=settings.b2_bucket_name, Key=_manifest_key(run_id)
        )
        return json.loads(resp["Body"].read())
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey"):
            return None
        raise RuntimeError(f"B2 manifest read failed for '{run_id}': {e}") from e
    except BotoCoreError as e:
        raise RuntimeError(f"B2 manifest read failed for '{run_id}': {e}") from e


def list_manifests() -> list[dict]:
    """Every run manifest in the bucket (newest-first left to the service)."""
    out: list[dict] = []
    for obj in _paginate(RUNS_PREFIX):
        key = obj["Key"]
        if not key.endswith(_MANIFEST_SUFFIX):
            continue
        run_id = key[len(RUNS_PREFIX) : -len(_MANIFEST_SUFFIX)]
        manifest = read_manifest(run_id)
        if manifest:
            out.append(manifest)
    return out


def write_log(run_id: str, text: str) -> None:
    client = get_s3_client()
    try:
        client.put_object(
            Bucket=settings.b2_bucket_name,
            Key=_log_key(run_id),
            Body=text.encode("utf-8"),
            ContentType="text/plain; charset=utf-8",
        )
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 log write failed for '{run_id}': {e}") from e


def read_log(run_id: str) -> str | None:
    client = get_s3_client()
    try:
        resp = client.get_object(Bucket=settings.b2_bucket_name, Key=_log_key(run_id))
        return resp["Body"].read().decode("utf-8", "replace")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey"):
            return None
        raise RuntimeError(f"B2 log read failed for '{run_id}': {e}") from e
    except BotoCoreError as e:
        raise RuntimeError(f"B2 log read failed for '{run_id}': {e}") from e


def stage_size(prefix: str) -> tuple[int, int]:
    """(object_count, total_bytes) under `prefix`."""
    objs = _paginate(prefix)
    return len(objs), sum(o["Size"] for o in objs)


def list_results(run_id: str) -> list[dict]:
    """Raw objects under results/<run_id>/ (scoped Results explorer)."""
    return _paginate(f"{RESULTS_PREFIX}{run_id}/")


def list_input_sheets() -> list[str]:
    """Candidate samplesheet keys under inputs/ (CSV/TSV) for the create form."""
    return sorted(
        obj["Key"]
        for obj in _paginate(INPUTS_PREFIX)
        if obj["Key"].lower().endswith(_SHEET_SUFFIXES)
    )


def presign_result(run_id: str, key: str, filename: str) -> str:
    """Presigned attachment download for a result object, scoped to the run.

    Raises ValueError if `key` is not under this run's results/ prefix — a
    caller can never reach another run's (or another prefix's) objects.
    """
    prefix = f"{RESULTS_PREFIX}{run_id}/"
    if not key.startswith(prefix) or ".." in key:
        raise ValueError("Result key must live under this run's results/ prefix")
    return get_presigned_url(key, filename=filename, expires_in=600)


def _delete_keys(keys: list[str]) -> int:
    """Batch-delete object keys (chunks of 1000). Returns count deleted."""
    if not keys:
        return 0
    client = get_s3_client()
    deleted = 0
    try:
        for i in range(0, len(keys), 1000):
            chunk = keys[i : i + 1000]
            client.delete_objects(
                Bucket=settings.b2_bucket_name,
                Delete={"Objects": [{"Key": k} for k in chunk], "Quiet": True},
            )
            deleted += len(chunk)
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(f"B2 delete failed: {e}") from e
    return deleted


def delete_run(run_id: str) -> int:
    """Delete a run and ALL of its own artifacts — scoped to this run's prefixes
    (runs/<id>/, work/<id>/, results/<id>/) ONLY. Never touches inputs/ (shared
    FASTQ) or any other run. Returns the number of objects removed."""
    total = 0
    for base in (RUNS_PREFIX, WORK_PREFIX, RESULTS_PREFIX):
        prefix = f"{base}{run_id}/"
        # Belt-and-braces: only ever delete keys that actually start with the
        # run-scoped prefix, so a listing quirk can never widen the blast radius.
        keys = [o["Key"] for o in _paginate(prefix) if o["Key"].startswith(prefix)]
        total += _delete_keys(keys)
    _invalidate_list_cache()
    return total


def humanize(size_bytes: int) -> str:
    return humanize_bytes(size_bytes)
