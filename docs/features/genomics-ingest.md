<!-- last_verified: 2026-09-10 -->
# Feature: Genomics ingest to B2

## Purpose
Get FASTQ inputs and samplesheets onto Backblaze B2 (under `inputs/`) so a Nextflow run can stage them, using presigned direct-to-B2 uploads that never traverse the API.

## Used By
- UI: `/upload` (drag-and-drop, accepts `.fastq`/`.fasta`/`.csv`/`.tsv` alongside the general upload types) for arbitrary input files; the create-run form's samplesheet selector reads discovered inputs and offers a **Seed demo inputs** button when none are found
- API: `POST /upload/presign`, `POST /upload/verify`, `GET /runs/inputs`, `POST /runs/inputs/seed`
- Script: `services/api/scripts/seed_inputs.py` (CLI wrapper for the same seeding — see below)

## Core Functions
- `app.service.upload` — validate + presign + verify (shared upload path)
- `app.repo.runs.list_input_sheets` — discovers samplesheets under `inputs/`
- `app.service.inputs.seed_demo_inputs` — uploads the bundled synthetic FASTQ + a generated samplesheet; shared by `POST /runs/inputs/seed` (in-app) and `seed_inputs.py` (CLI), so the two paths can't drift

## Canonical Files
- Pattern exemplar: `services/api/app/service/upload.py`
- Seeder: `services/api/app/service/inputs.py` (CLI wrapper: `services/api/scripts/seed_inputs.py`)

## Inputs
- FASTQ files (synthetic for the demo) and a samplesheet CSV (`sample,fastq`)

## Outputs
- Objects under `inputs/fastq/` and `inputs/samplesheets/` on B2
- Side effect: none beyond the B2 writes; the listing cache is invalidated

## Flow
- The browser asks the API to presign a PUT, uploads bytes directly to B2, then asks the API to verify the stored object.
- `seed_demo_inputs()` uploads `pipelines/demo/data/*.fastq` and writes `inputs/samplesheets/demo-samplesheet.csv` with `s3://` FASTQ paths, so a run can stage them — reachable either from the UI (**Seed demo inputs** button in the create-run form's empty samplesheet state) or the CLI (`seed_inputs.py`).
- The create-run form lists discovered samplesheets and preselects the seeded one.

## Why B2 matters here
Sequence inputs are large and numerous. Direct-to-B2 presigned uploads keep bytes off the API (lifting Vercel's ~4.5 MB Function limit) and land inputs straight in the same bucket Nextflow will read from — one lake, no copies.

## Edge Cases
- Oversized / disallowed uploads rejected at presign (see [file-upload.md](file-upload.md)).
- No samplesheets found → the create-run form offers a **Seed demo inputs** button (calls `POST /runs/inputs/seed`); the CLI script is an equivalent, scriptable alternative.
- **Synthetic data only** — never real human genomic sequence in `pipelines/demo/data/`.

## UX States (if applicable)
- Empty: no inputs → seed hint in the create-run form
- Loading: upload progress; input discovery is instant
- Error: upload errors surface the cause (CORS, size/type mismatch)

## Verification
- Test files: `services/api/tests/test_upload_validation.py`, `services/api/tests/test_upload_conflict.py`, `services/api/tests/test_seed_inputs.py`
- Required cases: presign validation happy path + rejects; verify path; seeding uploads the bundled fastqs + samplesheet and 404s when the bundled data is missing
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_upload_validation.py -q`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when E2E/live prerequisites apply
- Pass criteria: upload validation tests pass; seeding is documented and synthetic

## Related Docs
- [README.md](../../README.md)
- [File Upload](file-upload.md)
- [Nextflow runs](nextflow-runs.md)
