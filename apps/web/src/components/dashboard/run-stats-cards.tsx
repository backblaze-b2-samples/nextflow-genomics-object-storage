"use client";

import { FlaskConical, CheckCircle2, Loader2, FileBox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useRunStats } from "@/lib/queries";

export function RunStatsCards() {
  const { data: stats, isLoading, error, refetch } = useRunStats();

  // Surface fetch failures inline rather than rendering zeros — that would lie
  // about the run state when the API is simply unreachable.
  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const cards = [
    { title: "Total Runs", value: stats?.total_runs ?? 0, icon: FlaskConical },
    { title: "Succeeded", value: stats?.succeeded ?? 0, icon: CheckCircle2 },
    { title: "Running", value: stats?.running ?? 0, icon: Loader2 },
    { title: "Result Artifacts", value: stats?.result_artifacts ?? 0, icon: FileBox },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className={`card-hover animate-fade-in-up stagger-${i + 1}`}
        >
          <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2 px-4 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className="stat-icon-wrap">
              <card.icon className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="pb-5 px-4">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="stat-value">{card.value}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
