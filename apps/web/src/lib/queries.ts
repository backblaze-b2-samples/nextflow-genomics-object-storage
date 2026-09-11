"use client";

import { useEffect, useRef } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  ApiError,
  createRun,
  deleteFile,
  deleteRun,
  getDownloadUrl,
  getFileDetail,
  getFiles,
  getFileStats,
  getHealth,
  getPreviewUrl,
  getRun,
  getRunInputs,
  getRunLog,
  getRunResults,
  getRuns,
  getRunStats,
  launchRun,
  seedDemoInputs,
  getUploadActivity,
} from "@/lib/api-client";
import type {
  FileMetadata,
  FileMetadataDetail,
  GenomicsStats,
  ResultArtifact,
  RunCreateRequest,
  RunDetail,
  RunLog,
  RunManifest,
  RunStatus,
  SeedInputsResponse,
} from "@nextflow-genomics-object-storage/shared";

// Single source of truth for query keys. Keep these tightly scoped so that
// invalidating "files" doesn't blow away unrelated caches, and so an IDE
// "find usages" of `qk.files` reveals every consumer.
export const qk = {
  all: ["b2"] as const,
  files: (prefix?: string, limit?: number) =>
    [...qk.all, "files", prefix ?? "", limit ?? 100] as const,
  stats: () => [...qk.all, "stats"] as const,
  uploadActivity: (days: number) =>
    [...qk.all, "stats", "activity", days] as const,
  preview: (key: string) => [...qk.all, "preview", key] as const,
  detail: (key: string) => [...qk.all, "detail", key] as const,
  health: () => [...qk.all, "health"] as const,
  runs: () => [...qk.all, "runs"] as const,
  run: (runId: string) => [...qk.all, "runs", runId] as const,
  runLog: (runId: string) => [...qk.all, "runs", runId, "log"] as const,
  runResults: (runId: string) => [...qk.all, "runs", runId, "results"] as const,
  runInputs: () => [...qk.all, "runs", "inputs"] as const,
  runStats: () => [...qk.all, "runs", "stats"] as const,
};

export type Health = Awaited<ReturnType<typeof getHealth>>;

/**
 * Gate a query on something being open/visible. Deliberately the only option we
 * expose, so callers can't drift the caching policy per call site — the ⌘K
 * palette reuses `useFiles`' key (and therefore its cache) instead of fetching
 * its own private, smaller list.
 */
export interface QueryGate {
  enabled?: boolean;
}

export function useFiles(prefix = "", limit = 100, { enabled = true }: QueryGate = {}) {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.files(prefix, limit),
    queryFn: () => getFiles(prefix, limit),
    enabled,
  });
}

export function useFileStats({ enabled = true }: QueryGate = {}) {
  return useQuery({
    queryKey: qk.stats(),
    queryFn: getFileStats,
    enabled,
  });
}

export function useUploadActivity(days = 7) {
  return useQuery({
    queryKey: qk.uploadActivity(days),
    queryFn: () => getUploadActivity(days),
  });
}

// Presigned preview URL — only fetched when `enabled` is true (e.g., when
// the dialog opens for a specific file). Kept short-lived (60s) because
// the URL itself has a presigned expiry and is cheap to regenerate.
export function usePreviewUrl(key: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.preview(key ?? ""),
    queryFn: () => getPreviewUrl(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Rich metadata for an already-stored file. The server recomputes it on demand
// (a full object download), so it's only fetched when `enabled` — i.e. the
// preview dialog is open AND the user expands "Detailed metadata". Kept
// short-lived like the preview URL; cheap correctness under key overwrites.
export function useFileDetail(key: string | undefined, enabled: boolean) {
  return useQuery<FileMetadataDetail, ApiError>({
    queryKey: qk.detail(key ?? ""),
    queryFn: () => getFileDetail(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

// Health poll for the top-of-app B2 banner. `retry: false` and letting a
// failed fetch leave `data` undefined keeps a down API silent (the
// per-component ErrorState covers that); the banner only reacts to an up API
// reporting b2_connected: false. Polls every 60s and on window focus.
export function useHealth() {
  return useQuery<Health>({
    queryKey: qk.health(),
    queryFn: getHealth,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Drop a deleted object from every cached file list, plus its own cached
 * preview/detail entries.
 *
 * Invalidation alone is not enough: the refetch re-lists the whole bucket and
 * took 5-6s in practice, so the success toast fired while the row was still
 * listed — and using that stale row's Preview 404'd. Editing the cache makes
 * the row disappear with the toast; the invalidation that follows still
 * reconciles against the server.
 *
 * Exported for tests — the mutation below is its only production caller.
 */
export function dropDeletedFileFromCache(qc: QueryClient, fileKey: string) {
  qc.setQueriesData<FileMetadata[]>(
    // Partial key: matches qk.files(prefix, limit) for every prefix/limit.
    { queryKey: [...qk.all, "files"] },
    (previous) =>
      previous ? previous.filter((file) => file.key !== fileKey) : previous,
  );
  // A presigned URL for a deleted key can only 404 now.
  qc.removeQueries({ queryKey: qk.preview(fileKey) });
  qc.removeQueries({ queryKey: qk.detail(fileKey) });
}

/**
 * Fetch a download URL for one file.
 *
 * A mutation, not a query: it has a server side effect (it bumps the download
 * counter) and it must never be cached or replayed. Being a mutation is also
 * what gives the UI an honest pending state — the old code awaited the presign
 * inside a plain click handler, so a slow round trip left the screen completely
 * unchanged and a user could not tell a working download from a dead button.
 *
 * The caller performs the navigation (see `lib/browser-download.ts`) and gets
 * `isPending` / `variables` for the pending row.
 */
export function useDownloadUrl() {
  const qc = useQueryClient();
  return useMutation<{ url: string }, ApiError, FileMetadata>({
    mutationFn: (file) => getDownloadUrl(file.key),
    // The server counted a download, so the dashboard's "Total Downloads" is
    // now stale. Cheap: /files/stats reads a cached bucket listing.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.stats() }),
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileKey: string) => deleteFile(fileKey),
    onSuccess: (_data, fileKey) => {
      // Remove the row immediately, then reconcile everything (lists, stats,
      // activity) against the server in the background.
      dropDeletedFileFromCache(qc, fileKey);
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

// --- Genomics pipeline runs -------------------------------------------------

// A run in flight is polled so status + logs update without a manual refresh.
// Everything else stays event-driven (mutations invalidate) to avoid needless
// bucket scans.
const RUN_POLL_MS = 4000;

export function useRuns() {
  return useQuery<RunManifest[], ApiError>({
    queryKey: qk.runs(),
    queryFn: getRuns,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "running")
        ? RUN_POLL_MS
        : false,
  });
}

export const NON_TERMINAL_STATUSES: RunStatus[] = ["ready", "running"];
const TERMINAL_STATUSES: RunStatus[] = ["succeeded", "failed"];

export function useRun(runId: string) {
  const qc = useQueryClient();
  const query = useQuery<RunDetail, ApiError>({
    queryKey: qk.run(runId),
    queryFn: () => getRun(runId),
    enabled: !!runId,
    refetchInterval: (query) =>
      query.state.data?.manifest.status === "running" ? RUN_POLL_MS : false,
  });

  // The Results tab (`useRunResults`) mounts as soon as the run detail page
  // opens — often while the run is still "ready"/"running" and B2 genuinely
  // has no artifacts yet — and its query then caches that empty answer for
  // the default 30s staleTime. The tab stays mounted for the rest of the
  // session (Radix keeps the default-active TabsContent mounted), so nothing
  // ever tells it to look again: without this it takes a manual full-page
  // reload to see results after the run finishes. Force a refetch exactly
  // when the status crosses from non-terminal to terminal, so results appear
  // within one poll tick of "Succeeded" — no reload required.
  const status = query.data?.manifest.status;
  const previousStatusRef = useRef(status);
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    if (
      previousStatus &&
      NON_TERMINAL_STATUSES.includes(previousStatus) &&
      status &&
      TERMINAL_STATUSES.includes(status)
    ) {
      // A page reload mid-run remounts `useRunResults` fresh, so its very
      // first fetch can still be in flight here (partial/empty — the run
      // wasn't done yet when it started). React Query's own cancel-on-refetch
      // only kicks in once a query already has data (`state.data !==
      // undefined`), which a never-yet-resolved query doesn't, so a bare
      // invalidateQueries silently de-dupes onto that stale in-flight promise
      // instead of starting a fresh one — its partial result then sticks with
      // nothing left to supersede it. `cancelQueries` has no such gate: it
      // unconditionally cancels any in-flight fetch first, so the
      // invalidateQueries right after always starts a genuinely fresh fetch.
      qc.cancelQueries({ queryKey: qk.runResults(runId) });
      qc.invalidateQueries({ queryKey: qk.runResults(runId) });
    }
    previousStatusRef.current = status;
  }, [status, runId, qc]);

  return query;
}

export function useRunLog(runId: string, enabled: boolean, live: boolean) {
  return useQuery<RunLog, ApiError>({
    queryKey: qk.runLog(runId),
    queryFn: () => getRunLog(runId),
    enabled: enabled && !!runId,
    refetchInterval: live ? RUN_POLL_MS : false,
  });
}

export function useRunResults(runId: string, enabled = true, runIsActive = false) {
  return useQuery<ResultArtifact[], ApiError>({
    queryKey: qk.runResults(runId),
    queryFn: () => getRunResults(runId),
    enabled: enabled && !!runId,
    // Mirrors useRun's own polling. A fetch that started while the run was
    // still non-terminal (results incomplete) can land after the
    // terminal-transition invalidation's refetch — e.g. a page reload
    // mid-run remounts this query, so cancelling+invalidating once on the
    // transition (see useRun) isn't enough to beat every such race. Keep
    // refetching on the same cadence as the run itself while it's still
    // ready/running so any partial/stale snapshot self-corrects within one
    // poll tick once the run actually finishes, instead of sticking until a
    // manual "Refresh results" or full reload.
    refetchInterval: runIsActive ? RUN_POLL_MS : false,
  });
}

export function useRunInputs() {
  return useQuery<string[], ApiError>({
    queryKey: qk.runInputs(),
    queryFn: getRunInputs,
  });
}

export function useRunStats() {
  return useQuery<GenomicsStats, ApiError>({
    queryKey: qk.runStats(),
    queryFn: getRunStats,
  });
}

export function useSeedDemoInputs() {
  const qc = useQueryClient();
  return useMutation<SeedInputsResponse, ApiError, void>({
    mutationFn: seedDemoInputs,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.runInputs() });
      qc.invalidateQueries({ queryKey: qk.runStats() });
    },
  });
}

export function useCreateRun() {
  const qc = useQueryClient();
  return useMutation<RunManifest, ApiError, RunCreateRequest>({
    mutationFn: createRun,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.runs() });
      qc.invalidateQueries({ queryKey: qk.runStats() });
    },
  });
}

export function useLaunchRun() {
  const qc = useQueryClient();
  return useMutation<RunManifest, ApiError, string>({
    mutationFn: (runId) => launchRun(runId),
    onSuccess: (_data, runId) => {
      qc.invalidateQueries({ queryKey: qk.run(runId) });
      qc.invalidateQueries({ queryKey: qk.runs() });
      qc.invalidateQueries({ queryKey: qk.runStats() });
    },
  });
}

export function useDeleteRun() {
  const qc = useQueryClient();
  return useMutation<
    { deleted: boolean; run_id: string; objects_removed: number },
    ApiError,
    string
  >({
    mutationFn: (runId) => deleteRun(runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.runs() });
      qc.invalidateQueries({ queryKey: qk.runStats() });
    },
  });
}
