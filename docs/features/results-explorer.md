<!-- last_verified: 2026-09-10 -->
# Feature: Scoped Results explorer

## Purpose
Browse and download a single run's published artifacts under `results/<run_id>/` without exposing the rest of the bucket — a run-scoped view that complements the full [File Browser](file-browser.md).

## Used By
- UI: `/runs/[id]` → Results tab (`components/runs/results-explorer.tsx`)
- API: `GET /runs/{run_id}/results`, `GET /runs/{run_id}/results/download?key=…`

## Core Functions
- `app.service.runs.list_results` — lists + categorizes artifacts
- `app.service.runs.get_result_download_url` — presigns a scoped download
- `app.repo.runs.list_results` / `app.repo.runs.presign_result` — B2 listing + presign, prefix-guarded

## Canonical Files
- Pattern exemplar: `services/api/app/repo/runs.py` (`presign_result`)

## Inputs
- run_id: path parameter
- key: query parameter (must live under `results/<run_id>/`)

## Outputs
- ResultArtifact[]: key, name, category (`qc` | `align` | `variants` | `counts` | `other`), size, modified time
- `{ url }`: a 10-minute presigned GET (attachment) for one artifact

## Flow
- The explorer lists `results/<run_id>/` and groups objects by their stage directory (or file extension).
- A download click asks the API for a presigned URL; the server validates the key is inside this run's `results/` prefix before signing.

## Edge Cases
- Key outside the run's results prefix (or containing `..`) → `400`, never presigned — a caller cannot reach another run's or another prefix's objects.
- Run not found → `404`.
- No results yet (run not launched / still running) → empty state.

## UX States (if applicable)
- Empty: "No results yet" with guidance
- Loading: row skeletons
- Error: inline `ErrorState` with Retry

## Verification
- Test files: `services/api/tests/test_runs.py`
- Required cases: out-of-scope download key rejected (`400`); results listed + categorized
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_runs.py -q`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when E2E/live prerequisites apply
- Pass criteria: scope guard rejects foreign keys; happy path lists artifacts

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [File Browser](file-browser.md)
- [Nextflow runs](nextflow-runs.md)
