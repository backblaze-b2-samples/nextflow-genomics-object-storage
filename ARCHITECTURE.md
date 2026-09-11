<!-- last_verified: 2026-08-06 -->
# Architecture

## Components

- **apps/web/** — Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
  - Dashboard with genomics run metrics (runs by status, storage by stage)
  - Runs control plane: create, launch, monitor, delete; scoped Results explorer
  - Genomics ingest (drag-and-drop upload) + full-bucket File browser
  - Dark mode via `next-themes`
- **services/api/** — FastAPI backend (layered architecture)
  - REST API for the Run entity, ingest, listing, deletion
  - B2 S3 integration via boto3 (storage) — confined to `repo/`
  - Nextflow subprocess orchestration (compute) — confined to `service/`
  - Health check endpoint with B2 connectivity verification
  - Structured JSON logging with request tracing
  - Prometheus-format metrics endpoint
- **pipelines/demo/** — bundled Docker-free Nextflow DSL2 pipeline + synthetic data
- **packages/shared/** — TypeScript type definitions
  - Mirrors Pydantic models from the API
  - Consumed by `apps/web/` as workspace dependency

## Backend Layering

The API follows a strict layered architecture:

```
types/     Pydantic models — no logic, no imports from other layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access (boto3 B2 client) — no business logic
  |
service/   Business logic — calls repo, returns types
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` -> `config` -> `repo` -> `service` -> `runtime`
2. No backward imports (e.g., service must not import from runtime)
3. `boto3` only allowed in `repo/` layer
4. All boundary data uses Pydantic models (no raw dicts across layers)
5. Authored Python files under `services/api/app/` stay under 300 lines

### Directory Structure

```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/                 Pydantic models (RunManifest, FileMetadata, GenomicsStats, …)
    config/                Settings loaded from environment (B2_* + Nextflow bins)
    repo/                  B2 S3 client + runs manifest/log/results (data access)
    service/               Business logic (runs, nextflow, upload, files)
    runtime/               FastAPI route handlers (runs, files, upload, …)
  scripts/                 seed_inputs.py, setup_b2_cors.py, export_openapi.py
  tests/                   pytest tests (structural + integration)
pipelines/demo/            main.nf (DSL2) + bin/*.py processes + synthetic data
```

## Boundary Invariants

- **No external SDK leakage**: `boto3` is only imported in `app/repo/`. All other layers interact with B2 through the repo interface.
- **No raw dicts at boundaries**: All data crossing layer boundaries uses typed Pydantic models.
- **No cross-layer mutable state**: Configuration is read-only after init, and no mutable state is shared *between* layers. Intra-layer caches/counters (the listing cache in `repo/list_cache.py`, the B2 connectivity cache in `repo/b2_client.py`, the download counter in `repo/counter.py`, the rate-limit and metrics state in `runtime/`) are module-local and guarded by a `threading.Lock`. The listing cache also owns the only background thread in the app: a stale entry is served immediately while that thread re-scans (stale-while-revalidate), and `main.lifespan` warms it once at startup so no user pays for the cold full-bucket scan.
- **Validated inputs**: All HTTP inputs validated by FastAPI/Pydantic. File keys reject empty and path-traversal patterns; optional prefix confinement via `ALLOWED_KEY_PREFIX` (off by default).

## Deployment

- **Local dev** — `pnpm dev` runs both services via `concurrently`
  - Web: `localhost:3000`
  - API: `localhost:8000`
- **Railway** — two services from the same repository: `web` builds from the
  repository root because it consumes `packages/shared`; `api` builds from
  `services/api`. Each service's versioned config sits at its own root —
  `railway.json` and `services/api/railway.json` — the default path Railway
  discovers, so a one-click template deploy inherits the same build, start, and
  health behavior with nothing to configure by hand. The human-approved
  staging/production contract lives in [infra/railway/README.md](infra/railway/README.md).
- **Vercel** — one project using [Vercel Services](https://vercel.com/docs/services):
  the `web` (Next.js) and `api` (FastAPI) services build from the same repo and
  share one origin — the web app at `/`, the API under `/api`. The repo-root
  `vercel.json` declares both services and routes `/api/*` to the API service;
  the Vercel-only `services/api/index.py` strips the `/api` prefix so FastAPI
  keeps its native paths (`/health`, `/files`, …). Uploads go directly from the
  browser to B2 via a presigned PUT (see
  [File Upload](docs/features/file-upload.md)), so they bypass the Function's
  4.5 MB payload ceiling entirely — the bucket must allow the deploy origin in
  its CORS. A two-separate-Projects alternative and the full delivery contract
  live in [infra/vercel/README.md](infra/vercel/README.md).

External provisioning and deployment remain explicit user-approved actions.

## The Run entity & Nextflow orchestration

The primary entity is a **Run** (a genomics pipeline run). It is persisted as
`runs/<run_id>/manifest.json` on B2 — there is no database. Two boundaries stay
strictly separated:

- **Storage (boto3)** lives only in `repo/` (`repo/runs.py` for manifests, logs,
  results listing, scoped delete; `repo/b2_client.py` for the shared S3 client).
- **Compute (Nextflow subprocess)** lives only in `service/nextflow.py`. It never
  imports boto3. It generates a per-run `nextflow.config` that points Nextflow's
  own AWS client at B2 (`aws.client.endpoint` derived from `B2_REGION`,
  `s3PathStyleAccess = true`), injects B2 credentials through the subprocess
  environment (never written to disk), and shells out to `nextflow run … -work-dir
  <local path> --outdir s3://…/results/<id>` — the bundled demo's LOCAL executor
  requires a POSIX workDir; an `s3://` workDir needs a cloud executor (e.g. AWS
  Batch) or Fusion. Execution runs on a background thread; the terminal status +
  log are written back to B2. If the `nextflow`
  binary or Java is missing, the run degrades to `blocked` (contain-and-surface).

Nextflow's AWS SDK is a separate S3 client from the app's boto3; the app's B2
attribution custom user agent (`b2ai-nextflow-genomics-object-storage`) is set on
boto3, which is the surface `/b2-doctor` audits. The run's per-app identity is
also written into every manifest on B2.

## Data Stores

- **Backblaze B2** — object storage (S3-compatible API), the sole data store
  (no application database). One bucket, organized by stage:

  ```
  inputs/    FASTQ + samplesheets (ingest; shared across runs)
  runs/      <run_id>/manifest.json (the run record) + nextflow.log
  work/      <run_id>/ Nextflow workDir — only used with a cloud executor / Fusion;
             the bundled demo's workDir is local (LOCAL executor needs a POSIX path)
  results/   <run_id>/{qc,align,variants,counts}/ published outputs
  ```

  - Listing/metadata via S3 `list_objects_v2` / `head_object`
  - Run delete is scoped: it removes only `runs/<id>/`, `work/<id>/`, and
    `results/<id>/` — never `inputs/` or another run.

## External Services

- **Backblaze B2 S3 API** — file storage, retrieval, deletion, presigned URLs

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md) for full security documentation.

- **Frontend -> API** — CORS-restricted to configured origins. `CORSMiddleware` is registered LAST in `main.py` (outermost) so it wraps **every** response, including uncaught-exception 500s — otherwise the browser would block error responses and the UI would only see an opaque "network error". See [docs/RELIABILITY.md](docs/RELIABILITY.md#error-handling). A per-IP rate-limit middleware sits inner to CORS; see [docs/SECURITY.md](docs/SECURITY.md#rate-limiting).
- **API -> B2** — authenticated via application keys, signature v4
- **Client -> B2** — presigned URLs for download (10-min expiry, forced attachment)

## Data Flows

- **Ingest**: Browser -> `POST /upload/presign` (API validates + signs a PUT) -> Browser PUTs bytes **directly to B2** (`inputs/…`) -> `POST /upload/verify`
- **Create run**: Browser -> `POST /runs` -> service writes `runs/<id>/manifest.json` (status `ready`)
- **Launch run**: Browser -> `POST /runs/{id}/launch` -> service checks the engine -> `running` (starts the Nextflow subprocess; work + results stream to B2) or `blocked` (engine missing)
- **Monitor**: Browser polls `GET /runs/{id}` (status + stage sizes) and `GET /runs/{id}/log` while `running`
- **Results**: Browser -> `GET /runs/{id}/results` (scoped to `results/<id>/`) -> download via `GET /runs/{id}/results/download?key=…` (prefix-guarded presign)
- **Delete run**: Browser -> `DELETE /runs/{id}` -> repo deletes only that run's `runs/`, `work/`, `results/` prefixes
- **Browse/Download (full bucket)**: `GET /files`, `GET /files-by-key/download?key=…` -> service validates key -> repo lists / presigns

## Observability

- Structured JSON logging on all requests with `request_id`
- Request timing middleware (logs duration per request; also the catch-all that converts uncaught exceptions to a typed JSON 500)
- `/metrics` endpoint (Prometheus format: request count, latency, upload count)
- `/health` endpoint (B2 connectivity check)

## API Contract

- Checked-in OpenAPI artifact: `docs/api/openapi.json`
- Export/check command: `pnpm contract:export` / `pnpm contract:check`
- FastAPI freshness test: `services/api/tests/test_openapi_contract.py`
- Frontend route drift test: `apps/web/src/lib/api-contract.test.ts`

The frontend client keeps a small `API_CLIENT_ROUTES` registry in
`apps/web/src/lib/api-client.ts`. Tests compare that registry to the checked-in
OpenAPI artifact so route changes fail loudly before the hand-written client can
silently drift from FastAPI. `GET /metrics` is intentionally server-only.

## Canonical Files

- Run control plane (headline): `services/api/app/service/nextflow.py`, `services/api/app/service/runs.py`, `services/api/app/repo/runs.py`, `services/api/app/runtime/runs.py`
- Bundled pipeline: `pipelines/demo/main.nf` + `pipelines/demo/bin/*.py`
- Layered API handler: `services/api/app/runtime/upload.py`
- Service orchestration: `services/api/app/service/upload.py`
- B2 data access (repo layer): `services/api/app/repo/b2_client.py`
- Pydantic models: `services/api/app/types/` (`runs.py`, `files.py`, `upload.py`, `stats.py`, `formatting.py`)
- Config (pydantic-settings): `services/api/app/config/settings.py`
- Structural tests: `services/api/tests/test_structure.py`
- OpenAPI contract: `docs/api/openapi.json`
- OpenAPI exporter: `services/api/scripts/export_openapi.py`
- Frontend API client: `apps/web/src/lib/api-client.ts`
- Shared TypeScript types: `packages/shared/src/types.ts`

## Core Features

- [Genomics ingest](docs/features/genomics-ingest.md)
- [Nextflow run orchestration](docs/features/nextflow-runs.md)
- [Results explorer](docs/features/results-explorer.md)
- [File Upload](docs/features/file-upload.md)
- [File Browser](docs/features/file-browser.md)
- [Dashboard](docs/features/dashboard.md)

## References

- [docs/SECURITY.md](docs/SECURITY.md) — security principles and implementation
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — reliability expectations
- [AGENTS.md](AGENTS.md) — architectural invariants and agent instructions
