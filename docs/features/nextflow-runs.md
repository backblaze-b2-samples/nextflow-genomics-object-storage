<!-- last_verified: 2026-09-10 -->
# Feature: Nextflow run orchestration (headline)

## Purpose
Launch and monitor a **real** Nextflow pipeline run that stages inputs from Backblaze B2 and publishes its `--outdir` back to B2 over the S3-compatible API, so B2 is the data lake for genomics compute. The bundled demo pipeline runs Nextflow's LOCAL executor, so its `workDir` is a local POSIX path — only a cloud executor (e.g. AWS Batch) or Fusion can put `workDir` on `s3://` too.

## Used By
- UI: `/runs` (list + create), `/runs/[id]` (detail, Launch, log, results)
- API: `GET/POST /runs`, `GET /runs/{run_id}`, `POST /runs/{run_id}/launch`, `DELETE /runs/{run_id}`, `GET /runs/{run_id}/log`, `GET /runs/inputs`
- Job: the Nextflow subprocess, run on a background thread by the launch endpoint

## Core Functions
- `app.service.runs` — create/list/launch/delete, status transitions, stage accounting
- `app.service.nextflow` — engine detection, `nextflow.config` generation, command building, subprocess execution
- `app.repo.runs` — manifest + log persistence and scoped delete on B2

## Canonical Files
- Pattern exemplar: `services/api/app/service/nextflow.py`
- Bundled pipeline: `pipelines/demo/main.nf` + `pipelines/demo/bin/*.py`

## Inputs
- RunCreateRequest: name (free text), pipeline (`demo` | `nf-core/sarek` | `nf-core/rnaseq`), profile (`test` | `docker` | `singularity` | `standard`), samplesheet (object key under `inputs/`)

## Outputs
- `runs/<run_id>/manifest.json` — the run record (B2 is the sole store)
- `runs/<run_id>/nextflow.log` — captured Nextflow log
- Nextflow workDir (staged intermediates) — local disk for this demo (LOCAL executor); `work/<run_id>/` on B2 only applies with a cloud executor / Fusion
- `results/<run_id>/{qc,align,variants,counts}/` — published outputs, on B2
- Side effect: launches the `nextflow` binary as a subprocess

## Flow
- Create a run → manifest persisted with status `ready`.
- Launch → the service checks the engine. If `nextflow` + Java are on PATH, it writes a per-run `nextflow.config` (B2 `aws { endpoint/region/s3PathStyleAccess }`, credentials injected via the subprocess env — never written to disk), sets status `running`, and starts the subprocess on a background thread.
- The subprocess stages inputs from `s3://<bucket>/inputs/…` and publishes `results/` to `s3://<bucket>/…` (workDir is local disk). On exit, the log is written to B2 and status becomes `succeeded` (exit 0) or `failed`.
- The UI polls status + log while a run is `running`.

## Why B2 matters here
Nextflow speaks S3 natively for `-work-dir` and `publishDir`. Pointing `publishDir`/`--outdir` at B2 (`s3://<bucket>/results/<id>`) turns B2 into the terabyte-scale, low-cost data lake for pipeline results — no on-prem NFS, and the S3 endpoint comes from a single `B2_REGION`. Putting `-work-dir` on B2 too needs a cloud executor (e.g. AWS Batch) or Fusion — the bundled demo's LOCAL executor keeps workDir local.

## Edge Cases
- `nextflow` or Java missing → run goes to `blocked` with an install hint (never crashes).
- Non-zero exit → status `failed`, message points at the run log.
- Unexpected execution error → contained, status `failed`, error captured to the log.
- nf-core pipelines require network + a container engine (documented, not the default).

## UX States (if applicable)
- Empty: no runs yet → create-run CTA
- Loading: skeletons on list + detail; log/results skeletons
- Error: inline `ErrorState` with Retry; `blocked`/`failed` alerts with the message

## Verification
- Test files: `services/api/tests/test_runs.py`
- Required cases: create → ready, launch → blocked (no engine), launch → running (engine present, execution mocked), execute → succeeded/failed, delete is prefix-scoped
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_runs.py -q`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when E2E/live prerequisites apply
- Pass criteria: all run tests pass with the subprocess mocked; no real B2 or Nextflow call in `pnpm verify`

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/app-workflows.md](../app-workflows.md)
- [Results explorer](results-explorer.md)
- [Genomics ingest](genomics-ingest.md)
