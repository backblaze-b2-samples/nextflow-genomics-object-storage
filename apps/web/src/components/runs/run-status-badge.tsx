import type { RunStatus } from "@nextflow-genomics-object-storage/shared";
import { Badge } from "@/components/ui/badge";

const STATUS_META: Record<
  RunStatus,
  { label: string; dot: string; className: string }
> = {
  ready: {
    label: "Ready",
    dot: "bg-muted-foreground",
    className: "text-muted-foreground",
  },
  running: {
    label: "Running",
    dot: "bg-[var(--brand-b2)] animate-pulse",
    className: "text-foreground",
  },
  succeeded: {
    label: "Succeeded",
    dot: "bg-[var(--success)]",
    className: "text-foreground",
  },
  failed: {
    label: "Failed",
    dot: "bg-destructive",
    className: "text-foreground",
  },
  blocked: {
    label: "Blocked",
    dot: "bg-[var(--attention)]",
    className: "text-foreground",
  },
};

/** Colour-coded run status. Colour is paired with a text label (never
 *  colour-only), so the state is legible without relying on hue (WCAG). */
export function RunStatusBadge({ status }: { status: RunStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.ready;
  return (
    <Badge variant="outline" className={`gap-1.5 ${meta.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}
