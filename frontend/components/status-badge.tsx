import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-success/10 text-success",
  "Dispatch Watch": "bg-warning/15 text-warning",
  "Tech Review": "bg-danger/10 text-danger",
  "Maintenance Hold": "bg-danger/15 text-danger",
  Open: "bg-danger/10 text-danger",
  "In Review": "bg-warning/15 text-warning",
  "In Work": "bg-warning/15 text-warning",
  Deferred: "bg-slate-200 text-slate-700",
  Closed: "bg-success/10 text-success",
  Escalated: "bg-danger/15 text-danger",
  Monitoring: "bg-aqua/20 text-ink-900",
  Healthy: "bg-success/10 text-success",
  Warning: "bg-warning/15 text-warning",
  Degraded: "bg-warning/15 text-warning",
  Error: "bg-danger/10 text-danger",
  Ready: "bg-success/10 text-success",
  Pilot: "bg-warning/15 text-warning",
  "Critical Low": "bg-danger/15 text-danger",
  Low: "bg-warning/15 text-warning",
  Scheduled: "bg-slate-200 text-slate-700",
  Unscheduled: "bg-ink-900/10 text-ink-900",
  embedding: "bg-aqua/20 text-ink-900",
  fallback: "bg-slate-200 text-slate-700",
  AOG: "bg-danger/10 text-danger",
  Live: "bg-success/10 text-success",
  Cached: "bg-warning/15 text-warning",
  Unavailable: "bg-danger/10 text-danger",
  Airborne: "bg-aqua/20 text-ink-900",
  "On Ground": "bg-slate-200 text-slate-700",
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        STATUS_STYLES[value] || "bg-slate-100 text-slate-700"
      )}
    >
      {value}
    </span>
  );
}
