import { cn } from "@/lib/utils";

function getRiskStyles(riskScore: number) {
  if (riskScore >= 85) return "bg-danger text-white";
  if (riskScore >= 70) return "bg-danger/15 text-danger";
  if (riskScore >= 50) return "bg-warning/15 text-warning";
  return "bg-success/10 text-success";
}

export function RiskBadge({ score }: { score: number }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", getRiskStyles(score))}>{score.toFixed(1)}</span>;
}
