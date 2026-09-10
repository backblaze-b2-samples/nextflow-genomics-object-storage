"use client";

import Link from "next/link";
import { FlaskConical } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
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
import { RunStatusBadge } from "@/components/runs/run-status-badge";
import { CreateRunDialog } from "@/components/runs/create-run-form";
import { useRuns } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export function RunsTable() {
  const { data: runs = [], isLoading, error, refetch } = useRuns();

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="No runs yet"
            description="Create your first genomics pipeline run. Its work and results will be written to Backblaze B2."
            action={<CreateRunDialog />}
          />
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[30%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Run
                </TableHead>
                <TableHead className="w-[22%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pipeline
                </TableHead>
                <TableHead className="w-[12%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Profile
                </TableHead>
                <TableHead className="w-[16%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="w-[20%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.run_id} className="table-row-hover">
                  <TableCell className="font-medium">
                    <Link
                      href={`/runs/${run.run_id}`}
                      className="block truncate rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      title={run.name}
                    >
                      {run.name}
                    </Link>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {run.run_id}
                    </span>
                  </TableCell>
                  <TableCell className="truncate text-muted-foreground">
                    {run.pipeline}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {run.profile}
                  </TableCell>
                  <TableCell>
                    <RunStatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(run.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
