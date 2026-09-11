import { RunsTable } from "@/components/runs/runs-table";
import { CreateRunDialog } from "@/components/runs/create-run-form";

export default function RunsPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="page-title">Runs</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            Genomics pipeline runs. Each run stages inputs from Backblaze B2 and
            publishes results back to B2 as it executes with Nextflow.
          </p>
        </div>
        <div className="shrink-0">
          <CreateRunDialog />
        </div>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <RunsTable />
      </div>
    </div>
  );
}
