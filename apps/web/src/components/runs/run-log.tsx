"use client";

import { ScrollText } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRunLog } from "@/lib/queries";

export function RunLog({ runId, live }: { runId: string; live: boolean }) {
  const { data, isLoading, error, refetch } = useRunLog(runId, true, live);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    );
  }
  if (error) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }
  if (!data?.present || !data.log.trim()) {
    return (
      <EmptyState
        icon={ScrollText}
        title="No log yet"
        description="Launch the run to stream its Nextflow log here. The log is persisted to B2 at runs/<id>/nextflow.log."
      />
    );
  }

  return (
    <ScrollArea className="h-80 w-full rounded-md border border-border bg-muted/30">
      <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed">
        {data.log}
      </pre>
    </ScrollArea>
  );
}
