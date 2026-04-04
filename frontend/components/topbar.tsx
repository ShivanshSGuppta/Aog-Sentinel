"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Command, LogOut, Radar, ServerCog } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { useWorkspace } from "@/components/workspace-provider";
import { NAV_ITEMS, PAGE_METADATA } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

function resolvePageMeta(pathname: string) {
  if (pathname.startsWith("/aircraft/")) {
    return PAGE_METADATA["/aircraft"];
  }
  return PAGE_METADATA[pathname] || PAGE_METADATA["/"];
}

function toneForStatus(value?: string) {
  const normalized = value?.toLowerCase() || "";
  if (["healthy", "active", "ok", "ready"].some((item) => normalized.includes(item))) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["degraded", "warning", "pilot"].some((item) => normalized.includes(item))) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
}

export function Topbar() {
  const pathname = usePathname();
  const meta = resolvePageMeta(pathname);
  const { user, logout } = useAuth();
  const { workspace, workspaces, environment, workspaceId, selectWorkspace, loading } = useWorkspace();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-pearl/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
              <Radar className="h-3.5 w-3.5 text-aqua" />
              airline engineering control tower
            </div>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{meta.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{meta.description}</p>
          </div>

          <div className="hidden min-w-[420px] rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm xl:block">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Workspace</p>
                <p className="mt-1 text-sm font-semibold text-ink-900">{workspace?.airline_name || "Loading workspace"}</p>
              </div>
              <div className="w-[230px]">
                <Select
                  value={workspaceId || ""}
                  onChange={(event) => void selectWorkspace(event.target.value)}
                  disabled={loading || workspaces.length === 0}
                  className="h-10 rounded-xl border-slate-200 bg-slate-50 text-sm"
                >
                  {workspaces.map((item) => (
                    <option key={item.workspace_id} value={item.workspace_id}>
                      {item.airline_name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className={cn("rounded-full border px-3 py-1 font-medium", toneForStatus(environment?.control_plane_status))}>
                Control plane {environment?.control_plane_status || "-"}
              </span>
              <span className={cn("rounded-full border px-3 py-1 font-medium", toneForStatus(environment?.data_plane_status))}>
                Data plane {environment?.data_plane_status || "-"}
              </span>
              <span className={cn("rounded-full border px-3 py-1 font-medium", toneForStatus(environment?.connector_worker_status))}>
                Connectors {environment?.connector_worker_status || "-"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
                  active ? "bg-ink-900 text-white" : "border border-slate-200 bg-white text-slate-600"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="hidden items-center gap-2 text-xs text-slate-500 md:flex">
            <Link href="/" className="font-medium text-ink-900">
              AOG Sentinel
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span>{meta.title}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
              <span className="font-medium text-ink-900">{user?.full_name || "Authenticated User"}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
              <Command className="h-4 w-4 text-aqua" />
              {workspace?.deployment_mode || "Hybrid SaaS"}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
              <ServerCog className="h-4 w-4 text-aqua" />
              Platform {environment?.version || "v1.0"}
            </div>
            <Button variant="secondary" size="sm" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
