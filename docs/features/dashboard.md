<!-- last_verified: 2026-09-10 -->
# Feature: Dashboard

## Purpose
Give an at-a-glance view of the genomics pipeline: runs by status, result artifacts, and how the B2 data lake's storage is distributed across stages.

## Used By
- UI: `/` page (dashboard home)
- API: `GET /runs/stats`, `GET /runs`

## Core Functions
- `apps/web/src/components/dashboard/run-stats-cards.tsx` — Total Runs, Succeeded, Running, Result Artifacts
- `apps/web/src/components/dashboard/storage-by-stage.tsx` — proportional bars for inputs / runs / work / results
- `apps/web/src/components/dashboard/recent-runs-table.tsx` — most recent runs with status
- `apps/web/src/lib/queries.ts` — `useRunStats()`, `useRuns()`
- `services/api/app/runtime/runs.py` — `GET /runs/stats` handler
- `services/api/app/service/runs.py` — `get_stats()` aggregation
- `services/api/app/repo/runs.py` — manifest listing + per-prefix `stage_size()`

## Canonical Files
- Dashboard aggregation: `services/api/app/service/runs.py` (`get_stats`)
- Stat cards: `apps/web/src/components/dashboard/run-stats-cards.tsx`

## Inputs
- None (dashboard loads data automatically)

## Outputs
- `GET /runs/stats` → `GenomicsStats` (total_runs, per-status counts, result_artifacts, storage[] per stage)
- `GET /runs` → `RunManifest[]` (recent runs, newest-first)

## Flow
- Page loads → `GET /runs/stats` (aggregates all run manifests + measures each stage prefix on B2) and `GET /runs` (recent runs).
- Stat cards show total runs, succeeded, running, and result-artifact count.
- Storage-by-stage renders one proportional bar per prefix (inputs / runs / work / results) with bytes + object count — the data lake at a glance.
- Recent runs lists the newest runs with a colour-coded status badge, each linking to its detail page. The list auto-refreshes while any run is `running`.

## Edge Cases
- API unavailable → inline error states with Retry (never a false "0 runs").
- No runs / no data yet → empty states inviting a first run.
- Many runs / large prefixes → listing paginates via `ContinuationToken`.

## UX States
- Loading: skeletons for cards, bars, and table
- Empty: "No runs yet" / "No pipeline data yet"
- Error: inline `ErrorState` with Retry
- Loaded: populated cards, storage bars, recent runs

## Verification
- Test files: `services/api/tests/test_runs.py`
- Required cases: stats aggregation over manifests; recent runs listing
- Focused verify command: `cd services/api && .venv/bin/python -m pytest tests/test_runs.py -q`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when the E2E/live prerequisites in [Verification](../verification.md#non-live-verification) are available
- Pass criteria: focused tests and `pnpm verify` green

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [App Workflows](../app-workflows.md)
- [Nextflow runs](nextflow-runs.md)
