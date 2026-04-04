"use client";

import { Building2, DatabaseZap, ShieldCheck, Users } from "lucide-react";

import { useWorkspace } from "@/components/workspace-provider";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { LoadingState } from "@/components/loading-state";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import type { EnvironmentStatus, FleetItem, SiteItem, WorkspaceSummary, WorkspaceUserItem } from "@/lib/types";
import { formatDateTime, formatNumber } from "@/lib/utils";

function EnvironmentCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="font-medium text-ink-900">{value}</p>
        <StatusBadge value={value} />
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { workspace, workspaces, environment, loading, error } = useWorkspace();

  const tenantColumns: DataTableColumn<WorkspaceSummary>[] = [
    {
      key: "airline_name",
      header: "Airline workspace",
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium text-ink-900">{row.airline_name}</div>
          <div className="text-xs text-slate-500">{row.airline_code} · {row.primary_region}</div>
        </div>
      ),
    },
    { key: "deployment_mode", header: "Deployment", sortable: true },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => <StatusBadge value={row.status} />,
    },
    { key: "connector_count", header: "Connectors", align: "right", sortable: true },
    { key: "open_cases", header: "Cases", align: "right", sortable: true },
  ];

  const fleetColumns: DataTableColumn<FleetItem>[] = [
    { key: "fleet_name", header: "Fleet" },
    { key: "aircraft_count", header: "Aircraft", align: "right" },
  ];

  const siteColumns: DataTableColumn<SiteItem>[] = [
    { key: "site_name", header: "Site" },
    { key: "iata_code", header: "IATA" },
    { key: "type", header: "Type" },
  ];

  const userColumns: DataTableColumn<WorkspaceUserItem>[] = [
    { key: "name", header: "User" },
    { key: "role", header: "Role" },
    { key: "location", header: "Location" },
  ];

  if (loading) {
    return <LoadingState title="Loading workspace administration" description="Resolving tenant metadata, environment status, and workspace registries." />;
  }

  if (error || !workspace || !environment) {
    return <EmptyState title="Workspace administration unavailable" description={error || "Unable to load workspace administration data."} />;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Administration"
        title="Tenant-aware workspace and environment control"
        description="The control plane separates airline workspaces, deployment models, fleets, stations, and users while keeping environment health explicit."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Workspaces" value={formatNumber(workspaces.length)} description="Provisioned airline workspaces in the control plane" icon={Building2} />
        <KpiCard title="Fleets" value={formatNumber(workspace.fleets.length)} description="Fleet groups available in the active workspace" icon={ShieldCheck} accent="aqua" />
        <KpiCard title="Sites" value={formatNumber(workspace.sites.length)} description="Stations and maintenance bases under management" icon={DatabaseZap} accent="success" />
        <KpiCard title="Users" value={formatNumber(workspace.users.length)} description="Workspace roles assigned to engineering and ops users" icon={Users} accent="warning" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="panel p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Active workspace</p>
              <h3 className="mt-2 text-lg font-semibold text-ink-900">{workspace.airline_name}</h3>
              <p className="mt-2 text-sm text-slate-600">{workspace.description}</p>
            </div>
            <StatusBadge value={workspace.status} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Deployment mode</p>
              <p className="mt-1 font-medium text-ink-900">{workspace.deployment_mode}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Primary region</p>
              <p className="mt-1 font-medium text-ink-900">{workspace.primary_region}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Brand accent</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="h-8 w-8 rounded-full border border-slate-200" style={{ backgroundColor: workspace.branding.primary }} />
                <span className="text-sm font-medium text-ink-900">{workspace.branding.primary}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Platform sync</p>
              <p className="mt-1 text-sm font-medium text-ink-900">{formatDateTime(environment.last_platform_sync)}</p>
            </div>
          </div>
        </div>

        <div className="panel p-6">
          <h3 className="text-lg font-semibold text-ink-900">Environment status center</h3>
          <p className="mt-1 text-sm text-slate-600">Control-plane and connector runtime posture for the current tenant set.</p>
          <div className="mt-4 grid gap-3">
            <EnvironmentCard label="Control plane" value={environment.control_plane_status} />
            <EnvironmentCard label="Data plane" value={environment.data_plane_status} />
            <EnvironmentCard label="Event bus" value={environment.event_bus_status} />
            <EnvironmentCard label="Connector workers" value={environment.connector_worker_status} />
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
            <span>Active incidents: <strong className="text-ink-900">{environment.active_incidents}</strong></span>
            <span>Degraded connectors: <strong className="text-ink-900">{environment.degraded_connectors}</strong></span>
            <span>Version: <strong className="text-ink-900">{environment.version}</strong></span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="panel p-6">
          <h3 className="text-lg font-semibold text-ink-900">Workspace registry</h3>
          <div className="mt-4">
            <DataTable data={workspaces} columns={tenantColumns} rowKey={(row) => row.workspace_id} initialSort={{ key: "connector_count", direction: "desc" }} rowClassName={(row) => row.workspace_id === workspace.workspace_id ? "bg-aqua/10" : undefined} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel p-6">
            <h3 className="text-lg font-semibold text-ink-900">Fleets</h3>
            <div className="mt-4">
              <DataTable data={workspace.fleets} columns={fleetColumns} rowKey={(row) => row.fleet_id} />
            </div>
          </div>
          <div className="panel p-6">
            <h3 className="text-lg font-semibold text-ink-900">Sites</h3>
            <div className="mt-4">
              <DataTable data={workspace.sites} columns={siteColumns} rowKey={(row) => row.site_id} />
            </div>
          </div>
        </div>
      </div>

      <div className="panel p-6">
        <h3 className="text-lg font-semibold text-ink-900">Workspace users</h3>
        <p className="mt-1 text-sm text-slate-600">Representative roles across reliability engineering, maintenance control, and platform operations.</p>
        <div className="mt-4">
          <DataTable data={workspace.users} columns={userColumns} rowKey={(row) => row.user_id} />
        </div>
      </div>
    </div>
  );
}
