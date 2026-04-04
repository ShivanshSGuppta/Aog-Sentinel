import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  accent?: "aqua" | "danger" | "warning" | "success";
}

const accentClasses: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  aqua: "bg-aqua/15 text-ink-900",
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning/15 text-warning",
  success: "bg-success/10 text-success",
};

export function KpiCard({ title, value, description, icon: Icon, accent = "aqua" }: KpiCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{title}</p>
            <p className="mt-3 text-3xl font-semibold text-ink-900">{value}</p>
          </div>
          <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", accentClasses[accent])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="flex items-center justify-between px-6 py-4 text-sm text-slate-500">
          <span>{description}</span>
          <ArrowUpRight className="h-4 w-4 text-slate-300" />
        </div>
      </CardContent>
    </Card>
  );
}
