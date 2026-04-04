import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
}

export function EmptyState({ title, description, icon: Icon = Inbox }: EmptyStateProps) {
  return (
    <div className="panel flex min-h-[220px] flex-col items-center justify-center gap-4 p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
        <p className="mt-2 max-w-lg text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}
