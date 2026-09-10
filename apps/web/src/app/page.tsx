import { RunStatsCards } from "@/components/dashboard/run-stats-cards";
import { StorageByStage } from "@/components/dashboard/storage-by-stage";
import { RecentRunsTable } from "@/components/dashboard/recent-runs-table";
import { CreateRunDialog } from "@/components/runs/create-run-form";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Your genomics pipeline runs and the Backblaze B2 data lake behind
            them.
          </p>
        </div>
        <CreateRunDialog />
      </div>
      <RunStatsCards />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="animate-fade-in-up stagger-3">
          <StorageByStage />
        </div>
        <div className="animate-fade-in-up stagger-4">
          <RecentRunsTable />
        </div>
      </div>
    </div>
  );
}
