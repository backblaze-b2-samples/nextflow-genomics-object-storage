"use client";

import { HardDrive } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useRunStats } from "@/lib/queries";

const STAGE_LABELS: Record<string, string> = {
  inputs: "Inputs (FASTQ + samplesheets)",
  runs: "Run manifests + logs",
  work: "Work (staged intermediates)",
  results: "Results (published outputs)",
};

/** The genomics data lake at a glance: bytes stored per B2 prefix stage. A
 *  plain proportional bar (no chart dependency) keeps it legible and light. */
export function StorageByStage() {
  const { data: stats, isLoading, error, refetch } = useRunStats();

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Storage by stage</CardTitle>
        <CardDescription>
          How the pipeline&apos;s bytes are distributed across the B2 data lake.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !stats || stats.storage.every((s) => s.size_bytes === 0) ? (
          <EmptyState
            icon={HardDrive}
            title="No pipeline data yet"
            description="Seed inputs and launch a run to populate the inputs, work, and results stages."
          />
        ) : (
          <div className="space-y-4">
            {(() => {
              const max = Math.max(
                1,
                ...stats.storage.map((s) => s.size_bytes),
              );
              return stats.storage.map((stage) => (
                <div key={stage.stage} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">
                      {STAGE_LABELS[stage.stage] ?? stage.stage}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {stage.size_human} · {stage.object_count} obj
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[var(--brand-b2)]"
                      style={{
                        width: `${Math.round((stage.size_bytes / max) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
