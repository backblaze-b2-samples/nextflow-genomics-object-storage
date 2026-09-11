"use client";

import { Download, FolderOpen, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";

import type { ResultArtifact } from "@nextflow-genomics-object-storage/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError, getRunResultDownloadUrl } from "@/lib/api-client";
import { useRunResults } from "@/lib/queries";

/** Scoped Results explorer — lists only results/<run_id>/ objects. The download
 *  presign is server-validated to stay inside this run's own prefix. */
export function ResultsExplorer({
  runId,
  runIsActive = false,
}: {
  runId: string;
  /** Parent run's status is still ready/running — see useRunResults. */
  runIsActive?: boolean;
}) {
  const {
    data: artifacts = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useRunResults(runId, true, runIsActive);

  const download = useMutation<{ url: string }, ApiError, ResultArtifact>({
    mutationFn: (artifact) => getRunResultDownloadUrl(runId, artifact.key),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (err) => toast.error("Download failed", { description: err.message }),
  });

  // Manual retry affordance, matching the Files page's Refresh button: the
  // Results tab stays mounted for the whole session, so if a run finishes
  // while this tab isn't visible (or the automatic post-success refresh
  // hasn't landed yet) this is the user's way to ask again without a full
  // page reload.
  const refreshButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => refetch()}
      className="touch-target h-7 shrink-0 text-xs"
      disabled={isFetching}
      aria-label={isFetching ? "Refreshing results" : "Refresh results"}
    >
      <RefreshCw
        aria-hidden="true"
        className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`}
      />
      Refresh
    </Button>
  );

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (error) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }
  if (artifacts.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="No results yet"
        description="Result artifacts (QC, alignments, variants, counts) appear here once the run succeeds. They live under results/<id>/ on B2."
        action={refreshButton}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-end border-b border-border px-4 py-2.5">
        {refreshButton}
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Artifact
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Category
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Size
            </TableHead>
            <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Download
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {artifacts.map((artifact) => (
            <TableRow key={artifact.key} className="table-row-hover">
              <TableCell className="font-mono text-xs">{artifact.name}</TableCell>
              <TableCell>
                <Badge variant="secondary">{artifact.category}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                {artifact.size_human}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={download.isPending}
                  onClick={() => download.mutate(artifact)}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="sr-only">Download {artifact.name}</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
