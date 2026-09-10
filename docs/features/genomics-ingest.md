<!-- last_verified: 2026-09-10 -->
# Feature: Genomics ingest to B2

## Purpose
Get FASTQ inputs and samplesheets onto Backblaze B2 (under `inputs/`) so a Nextflow run can stage them, using presigned direct-to-B2 uploads that never traverse the API.

## Used By
- UI: `/upload` (drag-and-drop) for arbitrary input files; the create-run form's samplesheet selector reads discovered inputs
- API: `POST /upload/presign`, `POST /upload/verify`, `GET /runs/inputs`
- Script: `services/api/scripts/seed_inputs.py` (uploads the bundled synthetic FASTQ + a generated samplesheet)

## Core Functions
- `app.service.upload` — validate + presign + verify (shared upload path)
- `app.repo.runs.list_input_sheets` — discovers samplesheets under `inputs/`
- `seed_inputs.py` — one-command synthetic seeding

## Canonical Files
- Pattern exemplar: `services/api/app/service/upload.py`
- Seeder: `services/api/scripts/seed_inputs.py`

## Inputs
- FASTQ files (synthetic for the demo) and a samplesheet CSV (`sample,fastq`)

## Outputs
- Objects under `inputs/fastq/` and `inputs/samplesheets/` on B2
- Side effect: none beyond the B2 writes; the listing cache is invalidated

## Flow
- The browser asks the API to presign a PUT, uploads bytes directly to B2, then asks the API to verify the stored object.
- The seed script uploads `pipelines/demo/data/*.fastq` and writes `inputs/samplesheets/demo-samplesheet.csv` with `s3://` FASTQ paths, so a run can stage them.
- The create-run form lists discovered samplesheets and preselects the seeded one.

## Why B2 matters here
Sequence inputs are large and numerous. Direct-to-B2 presigned uploads keep bytes off the API (lifting Vercel's ~4.5 MB Function limit) and land inputs straight in the same bucket Nextflow will read from — one lake, no copies.

## Edge Cases
- Oversized / disallowed uploads rejected at presign (see [file-upload.md](file-upload.md)).
- No samplesheets found → the create-run form points you at the seed script.
- **Synthetic data only** — never real human genomic sequence in `pipelines/demo/data/`.

## UX States (if applicable)
- Empty: no inputs → seed hint in the create-run form
- Loading: upload progress; input discovery is instant
- Error: upload errors surface the cause (CORS, size/type mismatch)

## Verification
- Test files: `services/api/tests/test_upload_validation.py`, `services/api/tests/test_upload_conflict.py`
- Required cases: presign validation happy path + rejects; verify path
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_upload_validation.py -q`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when E2E/live prerequisites apply
- Pass criteria: upload validation tests pass; seeding is documented and synthetic

## Related Docs
- [README.md](../../README.md)
- [File Upload](file-upload.md)
- [Nextflow runs](nextflow-runs.md)
