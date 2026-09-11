# Build plan — `nextflow-genomics-object-storage`

Source of truth (Phase 0 clone):
`<workspace>/.claude/scratch/vcsk-bcc54597-a6f0-4ada-b26b-a791d4b7973b/`
Build target: `<workspace>/nextflow-genomics-object-storage`

## 1. Purpose

`nextflow-genomics-object-storage` shows bioinformaticians and clinical-genomics
teams how to use **Backblaze B2 as the terabyte-scale data lake for
[Nextflow](https://github.com/nextflow-io/nextflow) pipeline runs** — inputs,
intermediate work, and final results — over the S3-compatible API, replacing
expensive on-prem NFS. The app is a control plane for genomics pipeline **runs**:
you upload FASTQ inputs + a samplesheet to B2, configure and launch a Nextflow
run whose `workDir` and `--outdir` live on B2 (`s3://…`, endpoint pointed at B2),
watch its status and logs, then browse and download the BAM / VCF / counts / QC
artifacts it wrote back — all staged through B2. The headline engine is genuine
Nextflow (real DSL2, real S3 staging to B2), not a substitute. It ships a bundled,
Docker-free demo pipeline that runs anywhere Nextflow + Java are installed, and
documents the realistic `nf-core/sarek` / `nf-core/rnaseq -profile test` path for
teams with containers. Runs on local OSS — B2 credentials only, no second API key.

## 2. Architecture delta from vibe-coding-starter-kit

The starter kit is the ceiling — strip what genomics runs don't need, keep the
reusable B2 scaffolding, add the run control plane.

### KEEP (as-is — starter contract)
- **UI kit / design system** — `apps/web/src/components/ui/` (shadcn primitives),
  `apps/web/src/app/globals.css` tokens, `/design` reference page. Never edit
  generated `ui/` files; restyle via tokens only.
- **Bucket explorer (NON-NEGOTIABLE keep)** — `/files` route,
  `apps/web/src/app/files/`, `apps/web/src/components/files/`, and its Files
  sidebar entry. This is the full-bucket browse view; it stays even though the
  app adds a scoped Results explorer (see ADD). It lets an operator inspect the
  whole `inputs/ work/ results/ runs/` lake directly.
- **Upload** — `/upload` route + `apps/web/src/components/upload/` (presigned
  direct-to-B2 PUT). Reused to ingest FASTQ + samplesheet into `inputs/fastq/`.
  Keep the Upload sidebar entry.
- **Backend layering** `types → config → repo → service → runtime`, boto3 only in
  `repo/`, Pydantic at boundaries, TanStack Query hooks in `lib/queries.ts`,
  OpenAPI contract machinery, structural tests, the whole verify/CI gate set.
- Sidebar nav shell (`components/layout/app-sidebar.tsx`); B2 connectivity
  `/health`, `/metrics`, rate-limit + CORS middleware, listing cache, download
  counter.

### TRIM (remove from starter)
- **Starter dashboard content** — `apps/web/src/components/dashboard/` (upload
  chart, generic stats cards, recent-uploads table) and `/` page get **rewritten**
  (AGENTS.md §2 says the dashboard is the one screen designed to be replaced) into
  genomics-run metrics. Not deleted wholesale — replaced.
- **Generic-upload framing in docs/copy** — reframe around genomics ingest.
- Nothing else is stripped structurally; this is an additive control-plane sample.
  (Bucket explorer tension note: none — it is genuinely useful here as the raw
  lake view, so the mandatory keep costs us nothing.)

### ADD (new for this sample)
- **Primary entity: `Run`** — a genomics pipeline run. Persisted **on B2** as a
  JSON manifest (`runs/<run_id>/manifest.json`) so B2 stays the sole data store
  (no DB — starter invariant). Nextflow log persisted at `runs/<run_id>/nextflow.log`.
- **Run orchestration service** — `services/api/app/service/runs.py` launches
  Nextflow as a subprocess (`nextflow run <pipeline> -profile <profile>
  -work-dir s3://<bucket>/work/<run_id> --outdir s3://<bucket>/results/<run_id>`),
  with B2 wired in as the S3 backend via a generated `nextflow.config`
  (`aws.client.endpoint`, `aws.region`, `aws.client.s3PathStyleAccess=true`,
  creds from B2 env). Captures stdout/stderr → B2 log, transitions manifest
  status `ready → running → succeeded|failed`. Graceful degrade: if the
  `nextflow` binary or Java is missing, the run goes to a clear `blocked` state
  with an install hint — never crash (contain-and-surface).
- **Run repo layer** — `services/api/app/repo/runs.py`: manifest read/write/list/
  delete on B2, results listing scoped to `results/<run_id>/`, presigned result
  downloads. All boto3, all in `repo/`.
- **Bundled demo pipeline** — `pipelines/demo/main.nf` (DSL2) + `nextflow.config`:
  reads a (tiny, **synthetic**) FASTQ from B2, runs a QC process (read count, GC%,
  mean base quality), a toy align step (writes a minimal BAM-shaped output), and a
  toy variant/counts step (emits a spec-valid minimal VCF + a counts TSV), then
  publishes to `results/<run_id>/{qc,variants,counts}/` on B2. Pure-Python
  processes — no Docker, no reference genome, runs in seconds. This is the
  runnable default; `nf-core/sarek|rnaseq -profile test` documented as the
  realistic path.
- **Synthetic seed data** — `scripts/seed_inputs.py` (or a bundled
  `pipelines/demo/data/`) generates tiny synthetic FASTQ + a samplesheet.
  **Never real human genomic data** (privacy) — simulated reads only.
- **UI: Runs section** — `/runs` list + `/runs/[id]` detail, create-run form,
  Launch/Run action, delete, and a **scoped Results explorer** (see B2 surface).
- **Rewritten dashboard** — genomics run metrics.

## 3. B2 surface (S3-compatible only — no b2-native)

App's own boto3 calls, all in `repo/`:
- `put_object` / presigned PUT — ingest FASTQ + samplesheet to `inputs/fastq/`,
  write run manifests + logs to `runs/<run_id>/`.
- `list_objects_v2` — full-bucket explorer (kept) and **scoped Results explorer**
  (prefix `results/<run_id>/`), plus run listing (prefix `runs/`).
- `head_object` — artifact metadata.
- `get_object` / presigned GET (10-min, forced attachment) — download results;
  `B2_PUBLIC_URL_BASE` for public links.
- `delete_object(s)` — delete a run: scoped to that run's prefixes
  (`runs/<id>/`, `work/<id>/`, `results/<id>/`) **only** — never a broad wipe
  (honors shared-bucket safety rule).

Nextflow subprocess talks S3 directly via its own AWS SDK, endpoint-configured
for B2 (`aws.client.endpoint`, `s3PathStyleAccess=true`) — staging `work/` and
publishing `results/`. This is the genuine B2-as-data-lake demonstration.

**No b2-native API anywhere.** Custom user agent on the boto3 client and Nextflow
config; standardized `B2_*` env names (see §6 — this requires normalizing the
starter's `B2_KEY_ID`/`B2_ENDPOINT` names and adding `B2_REGION` +
`B2_PUBLIC_URL_BASE`; `/b2-doctor` gates it). `B2_REGION` is genuinely consumed —
Nextflow's `aws.region` needs it.

## 4. Key features (seed README + `docs/features/<feature>.md`)

1. **Genomics ingest to B2** — upload FASTQ + samplesheet to `inputs/fastq/` via
   presigned direct-to-B2 PUT. `deployment: local` (no external provider).
2. **Nextflow run orchestration (headline)** — configure, launch, and monitor a
   real Nextflow run whose work + results live on B2; bundled Docker-free demo
   pipeline + documented nf-core path. `deployment: local` — the heavy workload
   (Nextflow + Java + optional containers) runs on-device; inherits the
   CPU-default / GPU-autodetect rule vacuously (no CUDA/MPS path — pure CPU
   subprocess). No external API provider, no API key. Not a Genblaze case — the
   description names no Genblaze/genblaze-* stack, so no provider SDK routing.
3. **Run monitoring + logs** — poll status (`ready/running/succeeded/failed/
   blocked`) and tail the Nextflow log streamed to B2.
4. **Scoped Results explorer** — browse a run's `results/<run_id>/` artifacts
   (VCF / counts / QC), preview + presigned download. `deployment: local`.
5. **Genomics data-lake dashboard** — runs by status, samples processed, storage
   by stage (inputs / work / results), write-amplification, recent runs.

**External API provider:** none. Every feature is `deployment: local`; the app
uses B2 credentials only. (Confirmed against `api-provider-selection.md`: a
purely-local feature with no external provider is `deployment: local`.)

### Primary-entity lifecycle — entity: **Run**
DEFAULT is all lifecycle verbs in the UI. Decision per verb:
- **create** ✅ — "New run" form (see Form UX below). Produces a run in `ready`.
- **read** ✅ — `/runs` list + `/runs/[id]` detail (status, stage breakdown,
  logs, outputs).
- **run** ✅ — **Launch** button → `POST /runs/{id}/launch` starts Nextflow.
  This is the headline verb.
- **delete** ✅ — remove a run + its scoped B2 artifacts (`runs/`, `work/`,
  `results/` under that id only).
- **edit** ❌ **OMITTED (recorded, with justification)** — A launched run is an
  immutable execution record: its pipeline, samplesheet, and profile are the
  fixed provenance of a job that has run against B2; mutating them would falsify
  the recorded run. The `ready` pre-launch window is short-lived, so instead of a
  half-built edit form the UI offers **Clone to new run** (re-open the create form
  prefilled) + delete. → Phase 5 `omitted_ui_verbs`.

### Form UX conventions
Create-run form (mirror `apps/web/src/components/settings/settings-form.tsx`):
- **Selectors (finite value sets — never free text), create AND edit:**
  - `pipeline` → `Select`/`RadioGroup`: `demo` | `nf-core/sarek` | `nf-core/rnaseq`
  - `profile` → `Select`: `test` | `docker` | `singularity` | `standard`
  - `samplesheet` → `Select` populated from B2 `inputs/` listing (finite,
    discovered set).
- **Free text (unbounded):** `run name` / cohort label.
- **CREATE defaults as placeholder / `FormDescription` guidance only (never an
  autofill button):** pipeline → `demo`, profile → `test`, samplesheet → the
  seeded synthetic samplesheet, name → a suggested `cohort-YYYYMMDD` hint. These
  give a reviewer a known-good one-click-ish run without autofilling the form.
- No edit form ships (see omitted verb), so the create-only default-hint rule
  applies to the single create form; the selector rule still governs it.

## 5. Doc transforms
- **Rewrite** → genomics direction: `docs/features/dashboard.md` (run metrics),
  `docs/features/file-upload.md` (FASTQ ingest), `docs/features/file-browser.md`
  (bucket + scoped Results explorer), `ARCHITECTURE.md` (add Run entity, run
  orchestration, Nextflow subprocess boundary, B2 folder layout), `README.md`,
  `PRODUCT.md`, `docs/app-workflows.md` (run lifecycle journey).
- **Delete** → `docs/features/metadata-extraction.md` (image/PDF metadata is not
  this app's concern) unless trivially reframed; prefer delete to avoid dead copy.
- **New stubs** → `docs/features/nextflow-runs.md` (orchestration + B2 wiring),
  `docs/features/results-explorer.md`, `docs/features/genomics-ingest.md`. Follow
  `docs/features/_template.md`. Document the B2 folder layout
  (`inputs/ work/ results/ runs/`) and the Nextflow S3-endpoint config prominently
  — *why B2 matters*, not just how.
- Move completed exec-plans stay; add this plan to
  `docs/exec-plans/completed/initial-scaffold.md` on PASS (Phase 5).

## 6. Rename table (vibe-coding-starter-kit → nextflow-genomics-object-storage)

| Identifier | From | To |
|---|---|---|
| Repo slug (kebab) | `vibe-coding-starter-kit` | `nextflow-genomics-object-storage` |
| Display name / `APP_NAME` (`apps/web/src/lib/app-config.ts`) | `Vibe Coding Starter Kit` | `Nextflow Genomics Object Storage` |
| `APP_DESCRIPTION` | file-management template copy | `Genomics pipeline data lake on Backblaze B2 — Nextflow runs with B2 as the work + results store` |
| FastAPI title/description | derives from `APP_NAME` (branding gate) | inherits — do NOT hardcode |
| B2 attribution token — **single** value across `user_agent_extra` (boto3 `Config` + Nextflow config) AND `utm_content` (Backblaze links) | `b2ai-oss-start` | `nextflow-genomics-object-storage` |
| Python package (`services/api/app/`) | `app` (generic) | unchanged |
| Web package name (`apps/web/package.json`) | `web`/starter name | `nextflow-genomics-object-storage-web` (keep generic if gate prefers) |
| Shared package (`packages/shared`) | starter name | keep generic |
| CI workflow / service slugs (`web`, `api`) | generic | unchanged |
| **B2 env var normalization (B2 standard #3 — `/b2-doctor` gates)** | `B2_ENDPOINT`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_PUBLIC_URL` | `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_REGION`, `B2_PUBLIC_URL_BASE` (+ keep/derive endpoint from region; add `B2_REGION` for Nextflow `aws.region`). Update `settings.py`, `.env.example`, `b2_client.py`, AGENTS.md, README, dev-workflows together so `check:agent-docs` stays green. |

## Build guardrails (for the builder)
- Run `/b2-doctor` and satisfy all three standards; the env-var normalization
  above is the main standards delta and MUST land.
- Keep authored Python under `services/api/app/` < 300 lines/file; boto3 only in
  `repo/`; all new endpoints update `runtime/ + lib/api-client.ts
  (API_CLIENT_ROUTES) + lib/queries.ts + docs/api/openapi.json` and re-export the
  OpenAPI artifact (`pnpm contract:export`), backend-only routes into
  `SERVER_ONLY_OPERATIONS`.
- Every new screen state designed (loading skeleton, empty, error-with-retry) —
  PRODUCT.md quality bar. Public-facing sample → WCAG AA applies (this is an
  external sample, not internal-only).
- Synthetic genomic data only; never real human sequences.
- `pnpm verify` must pass (non-live, credential-free). Nextflow execution is a
  live runtime feature — its tests mock the subprocess.
- Delete scoping: any run delete touches only that run's own prefixes.
