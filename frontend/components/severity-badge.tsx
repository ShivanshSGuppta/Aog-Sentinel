import { cn } from "@/lib/utils";

const SEVERITY_STYLES = {
  Critical: "bg-danger text-white",
  High: "bg-danger/15 text-danger",
  Medium: "bg-warning/15 text-warning",
  Low: "bg-success/10 text-success",
};

export function SeverityBadge({ severity }: { severity: keyof typeof SEVERITY_STYLES }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", SEVERITY_STYLES[severity])}>
      {severity}
    </span>
  );
}
