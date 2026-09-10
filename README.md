<!-- last_verified: 2026-09-10 -->
# Nextflow Genomics Object Storage

Use **[Backblaze B2](https://www.backblaze.com/sign-up/ai-cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-nextflow-genomics-object-storage)** as the terabyte-scale data lake for [Nextflow](https://github.com/nextflow-io/nextflow) pipeline runs. This sample is a control plane for genomics runs: you ingest FASTQ + a samplesheet to B2, launch a **real** Nextflow run whose `workDir` and `--outdir` live on B2 over the S3-compatible API, watch its status and logs, then browse and download the QC / alignment / variant / counts artifacts it wrote back — all staged through B2, replacing expensive on-prem NFS.

The headline engine is genuine Nextflow (real DSL2, real S3 staging), not a substitute. It ships a bundled, **Docker-free** demo pipeline that runs anywhere Nextflow + Java are installed, and documents the realistic `nf-core/sarek` / `nf-core/rnaseq -profile test` path for teams with containers. It runs on local OSS — B2 credentials only, no second API key.

**What you get out of the box:**
- A **Run** control plane — create, launch, monitor, and delete genomics pipeline runs (Next.js 16 + React 19 + Tailwind v4 + shadcn/ui).
- Real Nextflow orchestration with B2 wired in as the S3 backend (`workDir` + `results` on `s3://`).
- A bundled, synthetic-data demo pipeline (`pipelines/demo/`) — no Docker, no reference genome, runs in seconds.
- Genomics ingest (presigned direct-to-B2 upload) plus a **scoped Results explorer** and the full **bucket explorer**.
- FastAPI backend with strict layered architecture, structural tests, and an agent-first doc set.

> **Runs use synthetic (simulated) sequence data only — never real human genomic data.**

## The B2 data lake layout

Every run reads and writes through one bucket, organized by stage:

```
inputs/      FASTQ + samplesheets you ingest (shared across runs)
runs/        <run_id>/manifest.json  (the run record — B2 is the sole store)
             <run_id>/nextflow.log   (captured Nextflow log)
work/        <run_id>/               Nextflow workDir (staged intermediates)
results/     <run_id>/{qc,align,variants,counts}/   published outputs
```

There is **no database**: a run's manifest JSON on B2 *is* the record. Nextflow's own AWS client stages `work/` and publishes `results/` directly to B2 (endpoint derived from `B2_REGION`, path-style access). That is the genuine "B2 as the data lake" demonstration.

## Quick Start

You need: Node.js >= 20, pnpm >= 9, Python >= 3.12, a free **[Backblaze B2 account](https://www.backblaze.com/sign-up/ai-cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-nextflow-genomics-object-storage)**, and — to actually *launch* runs — [Nextflow](https://www.nextflow.io/docs/latest/install.html) + a JDK 17+. Without the engine installed, the app still runs and launches move a run into a clear **`blocked`** state with an install hint (it never crashes).

### Get the code

```bash
git clone https://github.com/backblaze-b2-samples/nextflow-genomics-object-storage.git
cd nextflow-genomics-object-storage
```

### Setup

**1. Run setup**

```bash
pnpm run setup
```

This copies `.env.example` to `.env` (only when `.env` does not already exist), installs workspace dependencies from `pnpm-lock.yaml`, creates `services/api/.venv` if missing, validates that an existing venv uses Python 3.12+, and installs the API's committed Python 3.12 resolution from `services/api/requirements.lock`. It is safe to rerun and never overwrites an existing `.env`.

> Use the `pnpm run` form: `setup` (like `doctor`) is a built-in pnpm command before pnpm 11, so bare `pnpm setup` would run pnpm's own command instead of this script.

**2. Add your B2 credentials**

Open `.env` and, from the [Backblaze B2 dashboard](https://secure.backblaze.com/b2_buckets.htm?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-nextflow-genomics-object-storage):

1. **Create a bucket.** Paste each value into `.env`:
   - **Bucket Unique Name** → `B2_BUCKET_NAME`
   - **Region slug** (e.g. `us-west-004`, shown in the endpoint) → `B2_REGION` *(the S3 endpoint is derived from it)*
2. **Create an application key** with `Read and Write` permission:
   - **keyID** → `B2_APPLICATION_KEY_ID`
   - **applicationKey** → `B2_APPLICATION_KEY` *(only shown once — paste it now)*

> Want a walkthrough? See the docs for [creating a bucket](https://www.backblaze.com/docs/cloud-storage-create-and-manage-buckets) and [creating app keys](https://www.backblaze.com/docs/cloud-storage-create-and-manage-app-keys).

**3. Seed the synthetic demo inputs (optional but recommended)**

```bash
services/api/.venv/bin/python services/api/scripts/seed_inputs.py
```

This uploads the bundled simulated FASTQ to `inputs/fastq/` and writes a matching samplesheet to `inputs/samplesheets/` so the create-run form has a known-good, one-click-ish default.

**4. Run it**

```bash
pnpm dev
```

Frontend at `localhost:3000`, API at `localhost:8000`. Open **Runs → New run**, keep the `demo` pipeline + `test` profile + seeded samplesheet, and **Launch**. Watch the status and log, then open the **Results** tab to download the QC / VCF / counts artifacts. Interactive API docs are at `localhost:8000/docs`.

`pnpm dev` runs the preflight check first (wrong Node/Python version, missing venv, missing or placeholder `.env`, ports taken). Run it standalone with `pnpm run doctor`.

### Supported local environments

Local scripts run on macOS, Linux, and WSL2 — native Windows isn't supported yet (the dev scripts use POSIX shell). See [docs/verification.md](docs/verification.md#local-environments) for sandbox, port-fallback, and IPv6 behavior.

## When to use

Use this repository when you want a working example of running Nextflow pipelines against Backblaze B2 as the S3-compatible storage lake — ingesting inputs, staging intermediate work, and publishing results to B2 — with a control-plane UI, or as a scaffold to adapt for your own bioinformatics workflows.

## When not to use

Do not choose this repository expecting a complete hosted genomics platform. It does not provide managed compute, a job scheduler, reference-genome management, user accounts, authentication, tenant isolation, billing, or on-call operations. The bundled pipeline is a toy for demonstrating the storage path; production pipelines (nf-core and your own) and their compliance obligations for real sequence data are yours to own.

## Why Backblaze B2 for genomics?

[Backblaze B2](https://www.backblaze.com/cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-nextflow-genomics-object-storage) is the object storage this sample is built around — a deliberate default for data-heavy pipelines:

- **S3-compatible API.** Nextflow already speaks S3 for `work-dir` and `publishDir`; point it at B2's endpoint and it works unchanged. The app's own storage calls use `boto3`, isolated in `services/api/app/repo/`.
- **Built for terabyte-scale sequence data.** Genomics accumulates FASTQ, BAM/CRAM, VCF, and QC at scale. B2 runs at a fraction of hyperscaler pricing with generous free egress to many CDN and compute partners — so your pipeline's data lake doesn't dominate the bill.
- **Free to start.** A [free B2 account](https://www.backblaze.com/sign-up/ai-cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-nextflow-genomics-object-storage) is enough to run everything here.

## Core Features

- [Genomics ingest to B2](docs/features/genomics-ingest.md) — presigned direct-to-B2 upload of FASTQ + samplesheets into `inputs/`.
- [Nextflow run orchestration](docs/features/nextflow-runs.md) — configure, launch, and monitor a real Nextflow run whose work + results live on B2.
- [Results explorer](docs/features/results-explorer.md) — browse and download a run's `results/<run_id>/` artifacts (scoped), alongside the full bucket [File Browser](docs/features/file-browser.md).
- [Dashboard](docs/features/dashboard.md) — runs by status, result artifacts, and storage-by-stage across the data lake.
- [Design System](docs/design-system.md) — tokens, primitives, and the inline `ErrorState` / `EmptyState` patterns. Live preview at `/design`.
- Single-source config — one `.env` at the repo root powers API and web, validated at startup so misconfig fails fast.
- Centralized data layer — every fetch goes through TanStack Query hooks in `apps/web/src/lib/queries.ts`.
- Checked local API contract — [`docs/api/openapi.json`](docs/api/openapi.json) + `pnpm contract:check` catch FastAPI/client route drift.
- Structural tests, structured JSON logging, `/health` (B2 connectivity), `/metrics` (Prometheus), per-IP rate limiting.

## Agent-First Architecture

This repo is optimized for coding agents. **[AGENTS.md](AGENTS.md) is the single source of truth for all coding agents** — layout, invariants, commands, conventions. Architecture is enforced mechanically (structural tests + ruff + ESLint), not by convention. The knowledge base uses progressive disclosure:

```
AGENTS.md              Single source of truth — layout, invariants, commands, conventions
ARCHITECTURE.md        System layout, layering rules, data flows, the Run entity
docs/
  features/            Feature docs (ingest, runs, results, browser, dashboard)
  app-workflows.md     User journeys (the run lifecycle)
  dev-workflows.md     Engineering workflows, command index, releases
  verification.md      What each gate checks, and failure recovery
  frontend-conventions.md  Frontend conventions and data fetching
  SECURITY.md          Security principles
  RELIABILITY.md       Reliability expectations
  exec-plans/          Execution plans and tech debt tracker
```

Rebrand by editing a single file: `apps/web/src/lib/app-config.ts` (`APP_NAME`, `APP_DESCRIPTION`) updates the page title, sidebar, and breadcrumb everywhere. Contract and rationale: [AGENTS.md §2](AGENTS.md#2-building-on-this-starter-kit).

## Tech Stack

- TypeScript, Next.js 16, React 19, Tailwind v4, shadcn/ui
- TanStack Query — caching, dedup, retry for every fetch
- Python 3.12+, FastAPI, boto3, Pydantic v2
- **Nextflow** (DSL2) + Java 17+ for pipeline execution
- Backblaze B2 (S3-compatible object storage)
- pnpm workspaces (monorepo)

## Commands

The commands you reach for day to day:

| Command | What it does |
|---------|-------------|
| `pnpm run setup` | One-time cold start: copy `.env.example` → `.env` (only if missing), install workspace deps, create the backend venv, install locked API deps |
| `pnpm dev` | Start frontend + backend (runs the `pnpm run doctor` preflight first) |
| `pnpm wait-ready` | Block until the running web + API answer, print one line, exit 0/1 |
| `pnpm verify` | Credential-free pre-PR suite — runs `check:agent-docs`, `verify:api`, then `verify:web` |
| `pnpm verify:full` | `pnpm verify` plus Playwright E2E; needs a live local stack, real `.env`, free port 3000, and Chromium |
| `pnpm test:verify` | Run throwaway verification specs from `apps/web/e2e/verify/` against the app |
| `pnpm contract:export` / `pnpm contract:check` | Export / verify the FastAPI OpenAPI contract in `docs/api/openapi.json` |

`pnpm verify` is the gate to run before opening a PR. It needs `services/api/.venv` from `pnpm run setup`, but no B2 credentials or browser, and breaks down into `pnpm verify:api` (backend lint, tests, structure), `pnpm verify:web` (frontend lint, unit tests, typecheck + build), and `pnpm check:agent-docs` (agent-doc drift). Nextflow execution is a live feature, so its tests mock the subprocess and `pnpm verify` never shells out to Nextflow.

For the full command reference (`dev:web`, `dev:api`, `lint`, `test:*`, `check:structure`, `test:e2e`, live B2 tests), see [docs/dev-workflows.md](docs/dev-workflows.md#commands). For worktree/parallel-run notes and slow-run recovery, see [docs/verification.md](docs/verification.md).

## Deploying to Vercel

Deploys as **one Vercel project** — the Next.js web app and FastAPI API build from the same repo and share one origin (web at `/`, API under `/api`), so there's **no CORS and no second URL to wire up**.

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbackblaze-b2-samples%2Fnextflow-genomics-object-storage&project-name=nextflow-genomics-object-storage&repository-name=nextflow-genomics-object-storage&demo-title=Nextflow%20Genomics%20Object%20Storage&demo-description=Control%20plane%20for%20Nextflow%20genomics%20runs%20with%20Backblaze%20B2%20as%20the%20work%20%2B%20results%20data%20lake.&env=B2_APPLICATION_KEY_ID,B2_APPLICATION_KEY,B2_REGION,B2_BUCKET_NAME&envDescription=B2%20credentials%2C%20region%2C%20and%20bucket&envLink=https%3A%2F%2Fgithub.com%2Fbackblaze-b2-samples%2Fnextflow-genomics-object-storage%2Fblob%2Fmain%2Finfra%2Fvercel%2FREADME.md)

Set your B2 credentials, region, and bucket and you're live for ingest, browsing, and run management. Note: the serverless deploy is a control plane — actually *executing* Nextflow needs a host with the Nextflow binary + Java, so on Vercel runs report `blocked` at launch. Two things before a real deploy:

- Your bucket's CORS must allow the deploy origin (run `services/api/scripts/setup_b2_cors.py`).
- The deployed API is unauthenticated and bucket-wide — use a dedicated B2 bucket/prefix and key for any preview.

Full setup is in the [Vercel delivery contract](infra/vercel/README.md).

## Documentation Map

| Doc | Purpose |
|-----|---------|
| [AGENTS.md](AGENTS.md) | Agent table of contents — start here |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System layout, the Run entity, Nextflow boundary, B2 layout |
| [PRODUCT.md](PRODUCT.md) | What the app does and its quality bar |
| [docs/features/](docs/features/) | Feature docs (ingest, runs, results, browser, dashboard) |
| [docs/design-system.md](docs/design-system.md) | Design tokens, primitives, error/empty states |
| [docs/app-workflows.md](docs/app-workflows.md) | User journeys (the run lifecycle) |
| [docs/dev-workflows.md](docs/dev-workflows.md) | Engineering workflows, command index, releases |
| [docs/verification.md](docs/verification.md) | What each gate checks, and failure recovery |
| [docs/frontend-conventions.md](docs/frontend-conventions.md) | Frontend conventions, screens, data fetching |
| [docs/SECURITY.md](docs/SECURITY.md) | Security principles |
| [docs/RELIABILITY.md](docs/RELIABILITY.md) | Reliability expectations |
| [docs/api/openapi.json](docs/api/openapi.json) | Checked contract for the template's local FastAPI API |
| [infra/vercel/README.md](infra/vercel/README.md) | Vercel deployment contract |
| [docs/exec-plans/](docs/exec-plans/) | Execution plans and tech debt tracker |

## FAQ

**What does Nextflow Genomics Object Storage do?**
It is a control plane for Nextflow genomics pipeline runs that uses [Backblaze B2](https://www.backblaze.com/cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-nextflow-genomics-object-storage) as the S3-compatible data lake for inputs, intermediate work, and published results. You ingest FASTQ to B2, launch a run, and browse/download its artifacts.

**Is the Nextflow execution real, or mocked?**
Real. The backend launches the `nextflow` binary as a subprocess with B2 wired in as the S3 backend (`-work-dir s3://…`, `--outdir s3://…`). Only the automated test suite mocks the subprocess, so `pnpm verify` stays fast and credential-free.

**Do I need Docker or a reference genome?**
Not for the bundled `demo` pipeline — it uses pure-Python processes on synthetic data and runs in seconds. The `nf-core/sarek` and `nf-core/rnaseq` options are the documented realistic path and do need a container engine.

**What happens if Nextflow or Java isn't installed?**
The app never crashes. A launch moves the run into a `blocked` state with an install hint; the run record and its inputs are preserved so you can install the engine and relaunch.

**Does it use real human genomic data?**
No. All bundled inputs are simulated reads. Never place real human sequence data in `pipelines/demo/data/` — it carries privacy and consent obligations this sample does not handle.

**Why is there no Edit button on a run?**
A launched run is an immutable execution record — its pipeline, samplesheet, and profile are the fixed provenance of a job that ran against B2. Instead of editing, use **Clone to new run** to start a fresh run with the same configuration.

**Is it free / can I use it in production?**
The code is MIT-licensed and B2 offers a free account. It is a Backblaze-maintained sample; production use requires your own validation of security, operations, compliance, and support, and carries no SLA. See [When not to use](#when-not-to-use).

**Do I have to use Backblaze B2?**
It integrates B2 through the S3-compatible API, and B2 is the storage the sample is built around. You supply your own bucket, region, and application key during setup.

**Where do I get help or report bugs?**
Repository defects and feature requests: [GitHub Issues](https://github.com/backblaze-b2-samples/nextflow-genomics-object-storage/issues). For B2 account, billing, service, or API help: [Backblaze Support](https://www.backblaze.com/help).

## Maintenance and support

Backblaze maintains this open-source sample to help developers use B2 as the storage layer for data-heavy AI and bioinformatics workflows. Production use is possible with caution and requires your own validation. Report defects through [GitHub Issues](https://github.com/backblaze-b2-samples/nextflow-genomics-object-storage/issues); for B2 account, billing, service, or API help, use [Backblaze Support](https://www.backblaze.com/help). This sample is not covered by the Backblaze service level agreement; any B2 service or support commitments are governed separately by the applicable Backblaze terms and support plan.

## Contributing

Start with [AGENTS.md](AGENTS.md). It's the map — everything else is discoverable from there. For local commit hooks, follow [the pre-commit workflow](docs/verification.md#pre-commit).

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related projects

**Claude Agent B2 Skill** — manage Backblaze B2 from your terminal using natural language. Repo: [claude-skill-b2-cloud-storage](https://github.com/backblaze-b2-samples/claude-skill-b2-cloud-storage).
