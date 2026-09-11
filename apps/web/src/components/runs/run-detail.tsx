"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ErrorState } from "@/components/ui/error-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RunStatusBadge } from "@/components/runs/run-status-badge";
import { RunLog } from "@/components/runs/run-log";
import { ResultsExplorer } from "@/components/runs/results-explorer";
import { CreateRunDialog } from "@/components/runs/create-run-form";
import {
  NON_TERMINAL_STATUSES,
  useDeleteRun,
  useLaunchRun,
  useRun,
  useRunResults,
} from "@/lib/queries";

export function RunDetail({ runId }: { runId: string }) {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useRun(runId);
  const launch = useLaunchRun();
  const remove = useDeleteRun();
  const isRunning = data?.manifest.status === "running";
  // Same query + cache key as the Results tab's own useRunResults call below
  // (ResultsExplorer) — React Query dedupes them, so this adds no extra
  // polling, just a second reader of the same published-artifacts count for
  // the progress bar's numerator.
  const { data: results } = useRunResults(runId, isRunning, isRunning);
  const publishedCount = results?.length ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  const { manifest, stages, expected_artifacts: expectedArtifacts } = data;
  const isRunActive = NON_TERMINAL_STATUSES.includes(manifest.status);

  const onLaunch = () =>
    launch.mutate(runId, {
      onSuccess: (run) => {
        if (run.status === "blocked") {
          toast.warning("Run blocked", {
            description: "Nextflow or Java is not installed — see the note below.",
          });
        } else {
          toast.success("Run launched", {
            description: "Nextflow is running against B2.",
          });
        }
      },
      onError: (err) => toast.error("Launch failed", { description: err.message }),
    });

  const onDelete = () =>
    remove.mutate(runId, {
      onSuccess: (res) => {
        toast.success("Run deleted", {
          description: `Removed ${res.objects_removed} object(s) from B2.`,
        });
        router.push("/runs");
      },
      onError: (err) => toast.error("Delete failed", { description: err.message }),
    });

  return (
    <div className="space-y-6">
      <Link
        href="/runs"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All runs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="page-title truncate">{manifest.name}</h1>
            <RunStatusBadge status={manifest.status} />
          </div>
          <p className="mt-1.5 font-mono text-xs text-muted-foreground">
            {manifest.run_id}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {manifest.pipeline} · profile {manifest.profile}
            {manifest.samplesheet ? ` · ${manifest.samplesheet.split("/").pop()}` : ""}
          </p>
          {isRunning && (
            <div className="mt-3 max-w-xs">
              {expectedArtifacts ? (
                <>
                  <Progress
                    aria-label="Run progress"
                    value={Math.min(
                      100,
                      (publishedCount / expectedArtifacts) * 100
                    )}
                    className="h-1.5"
                  />
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {Math.min(publishedCount, expectedArtifacts)}/
                    {expectedArtifacts} artifacts published
                  </p>
                </>
              ) : (
                // Expected total unknown (non-demo pipeline, or an unreadable
                // samplesheet) — an honest indeterminate sweep beats a fake
                // percentage. Same track used by the Upload page.
                <div
                  role="progressbar"
                  aria-label="Run progress"
                  className="progress-indeterminate h-1.5 w-full rounded-full"
                />
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" className="h-8" disabled={isRunning || launch.isPending} onClick={onLaunch}>
            <Play className="h-3.5 w-3.5" />
            {manifest.status === "ready" ? "Launch" : "Relaunch"}
          </Button>
          <CreateRunDialog
            initial={{
              name: `${manifest.name}-clone`,
              pipeline: manifest.pipeline,
              profile: manifest.profile,
              samplesheet: manifest.samplesheet,
            }}
            trigger={
              <Button variant="outline" size="sm" className="h-8">
                <Copy className="h-3.5 w-3.5" />
                Clone
              </Button>
            }
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8" disabled={remove.isPending}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this run?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the run manifest, its Nextflow work
                  directory, and its results on B2 (runs/, work/, results/ under{" "}
                  <span className="font-mono">{manifest.run_id}</span>). Shared
                  inputs are never touched. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Delete run</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Edit is intentionally omitted: a launched run is an immutable execution
          record. Use Clone to start a new run with the same configuration. */}

      {manifest.status === "blocked" && manifest.message && (
        <Alert>
          <AlertTitle>Run blocked — Nextflow engine unavailable</AlertTitle>
          <AlertDescription>{manifest.message}</AlertDescription>
        </Alert>
      )}
      {manifest.status === "failed" && manifest.message && (
        <Alert variant="destructive">
          <AlertTitle>Run failed</AlertTitle>
          <AlertDescription>{manifest.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {stages.map((stage) => (
          <Card key={stage.stage}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {stage.stage} storage
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="stat-value">{stage.size_human}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {stage.object_count} object{stage.object_count === 1 ? "" : "s"} ·{" "}
                <span className="font-mono">{stage.prefix}</span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {manifest.command && (
        <Card>
          <CardHeader className="border-b border-border py-3 px-4">
            <CardTitle className="card-title">Nextflow command</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
              {manifest.command}
            </pre>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="results">
        <TabsList>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
        </TabsList>
        <TabsContent value="results">
          <Card>
            <CardContent className="p-0">
              <ResultsExplorer runId={runId} runIsActive={isRunActive} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="log">
          <Card>
            <CardContent className="p-4">
              <RunLog runId={runId} live={isRunning} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
