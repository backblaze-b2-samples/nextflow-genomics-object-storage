<!-- last_verified: 2026-09-10 -->
# App Workflows

User journeys inside the application. The run lifecycle is the primary journey.

## Ingest genomics inputs

- User navigates to `/upload` (or runs `services/api/scripts/seed_inputs.py` to load the bundled synthetic inputs).
- Drops or selects FASTQ / samplesheet files in the dropzone.
- Files upload **directly from the browser to B2** (a presigned PUT) into `inputs/`. A determinate progress bar tracks the bytes; when they are all sent the row switches to "Verifying upload..." while the API HEADs and magic-byte-sniffs the stored object.
- On success: toast + a "View in Files" link. On failure: a red status icon with the cause (e.g. bucket CORS, size/type mismatch).
- Inputs land in the same bucket a run will read from — one lake, no copies.
- See: [Genomics ingest](features/genomics-ingest.md), [File Upload](features/file-upload.md)

## Create and launch a run

- User navigates to `/runs` and clicks **New run**.
- The create form uses selectors for the finite fields — **pipeline** (`demo` | `nf-core/sarek` | `nf-core/rnaseq`), **profile** (`test` | `docker` | `singularity` | `standard`), **samplesheet** (discovered from B2 `inputs/`) — and a free-text **run name / cohort label**. Safe defaults are pre-selected (demo + test + the seeded samplesheet); the name field shows a `cohort-YYYYMMDD` placeholder. There is no autofill button.
- Submitting creates a run in `ready` and navigates to its detail page.
- Clicking **Launch** starts a real Nextflow run whose `workDir` and `--outdir` are `s3://…/work/<id>` and `s3://…/results/<id>`.
  - If Nextflow + Java are installed, status becomes `running` and the subprocess streams work + results to B2.
  - If the engine is missing, the run goes to `blocked` with an install hint — nothing crashes, and the run + inputs are preserved for a relaunch.
- A launched run is an immutable execution record, so there is **no Edit**. To change inputs, use **Clone to new run** (re-opens the create form prefilled). **Delete** removes only that run's `runs/`, `work/`, and `results/` prefixes.
- See: [Nextflow runs](features/nextflow-runs.md)

## Monitor a run and download results

- On `/runs/[id]`, the status badge and the per-stage storage cards (runs / work / results) update while a run is `running` (the page polls).
- The **Log** tab tails the Nextflow log streamed to `runs/<id>/nextflow.log` on B2.
- The **Results** tab is the scoped Results explorer: it lists `results/<id>/` artifacts grouped by category (QC / align / variants / counts) and offers a prefix-guarded presigned download for each — a download can never reach outside this run's results.
- See: [Results explorer](features/results-explorer.md)

## View the dashboard

- User navigates to `/` (home).
- Stat cards show total runs, succeeded, running, and result-artifact count.
- The storage-by-stage panel shows how many bytes/objects live under `inputs/`, `runs/`, `work/`, and `results/` — the data lake at a glance.
- The recent runs table links each run to its detail page and refreshes while any run is `running`.
- Empty and error states are explicit (never a false "0 runs").
- See: [Dashboard](features/dashboard.md)

## Browse the whole bucket

- User navigates to `/files` — the full-bucket explorer over `inputs/ work/ results/ runs/`.
- Files display in a tree with type icons; clicking a file opens a preview with Download / Delete; folders auto-expand until files are on screen.
- This is the raw lake view; for a single run's outputs, the scoped Results explorer on the run detail page is confined to that run.
- See: [File Browser](features/file-browser.md)

## Change preferences

- User navigates to `/settings`. A banner states the page is mostly a demonstration: only **Theme** is wired up for real; profile and preference fields persist to `localStorage` only and drive no behaviour.
- Saving reports honestly — it never claims a save that did not happen.
- See: [Settings](features/settings.md)
