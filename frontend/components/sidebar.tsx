"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlaneTakeoff, Radar, Server } from "lucide-react";

import { useWorkspace } from "@/components/workspace-provider";
import { NAV_SECTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const { workspace, environment } = useWorkspace();

  return (
    <aside className="hidden border-r border-slate-200/80 bg-white/95 lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col lg:px-6 lg:py-8">
      <div className="rounded-3xl bg-ink-950 p-5 text-white shadow-panel">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-aqua text-ink-950">
            <Radar className="h-6 w-6" />
          </div>
          <div>
            <p className="font-display text-xl font-semibold">AOG Sentinel</p>
            <p className="text-xs text-white/70">Fleet Reliability & Maintenance Intelligence</p>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
          <p className="font-medium text-white">{workspace?.airline_name || "Loading workspace"}</p>
          <p className="mt-1 text-white/60">{workspace?.deployment_mode || "Hybrid SaaS"}</p>
          <p className="mt-3 text-white/75">Control-plane orchestration, engineering workflows, and live network context for the active airline workspace.</p>
        </div>
      </div>

      <nav className="mt-8 flex-1 space-y-6 overflow-y-auto pr-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-4 text-[10px] uppercase tracking-[0.28em] text-slate-400">{section.title}</p>
            <div className="space-y-2">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                      active
                        ? "bg-ink-900 text-white shadow-panel"
                        : "text-slate-600 hover:bg-white hover:text-ink-900"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", active ? "text-aqua" : "text-slate-400")} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-6 space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex items-center gap-3 text-ink-900">
          <PlaneTakeoff className="h-4 w-4 text-aqua" />
          <p className="text-sm font-semibold">Workspace Snapshot</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <p className="font-medium text-ink-900">{workspace?.primary_region || "Global"}</p>
          <p className="mt-1">{workspace?.active_alerts || 0} active alerts · {workspace?.open_cases || 0} open cases</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <Server className="h-4 w-4 text-aqua" />
          <span>{environment?.connector_worker_status || "Connector workers pending"}</span>
        </div>
      </div>
    </aside>
  );
}
