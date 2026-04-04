"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, OctagonAlert, Radar, ShieldAlert, TimerReset } from "lucide-react";

import { useWorkspace } from "@/components/workspace-provider";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { LoadingState } from "@/components/loading-state";
import { RiskBadge } from "@/components/risk-badge";
import { SectionHeader } from "@/components/section-header";
import { SeverityBadge } from "@/components/severity-badge";
import { StatusBadge } from "@/components/status-badge";
import { api } from "@/lib/api";
import type { AlertItem, AlertSummary, OperationalEvent } from "@/lib/types";
import { formatDateTime, formatNumber } from "@/lib/utils";

export default function AlertsPage() {
  const { workspaceId, workspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [summaryData, alertData, eventData] = await Promise.all([
          api.getAlertSummary(workspaceId),
          api.getAlerts(workspaceId),
          api.getEventFeed(workspaceId),
        ]);
        if (!active) return;
        setSummary(summaryData);
        setAlerts(alertData);
        setEvents(eventData);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load alert command center.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const columns: DataTableColumn<AlertItem>[] = [
    {
      key: "title",
      header: "Alert",
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium text-ink-900">{row.title}</div>
          <div className="text-xs text-slate-500">{row.summary}</div>
        </div>
      ),
    },
    {
      key: "severity",
      header: "Severity",
      sortable: true,
      render: (row) => <SeverityBadge severity={row.severity as "Critical" | "High" | "Medium" | "Low"} />,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => <StatusBadge value={row.status} />,
    },
    {
      key: "risk_score",
      header: "Risk",
      sortable: true,
      align: "right",
      render: (row) => <RiskBadge score={row.risk_score} />,
    },
    { key: "owner", header: "Owner", sortable: true },
    { key: "station", header: "Station", sortable: true },
  ];

  const topAlerts = useMemo(() => [...alerts].sort((a, b) => b.risk_score - a.risk_score).slice(0, 3), [alerts]);

  if (workspaceLoading || loading) {
    return <LoadingState title="Loading alert command center" description="Routing engineering alerts, source events, and severity exposure." />;
  }

  if (workspaceError || error || !workspace || !summary) {
    return <EmptyState title="Alert command center unavailable" description={workspaceError || error || "Unable to load workspace alerts."} />;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Alerting"
        title="Watchlists, routed actions, and source-event visibility"
        description="Normalized operational events trigger workspace alerts with severity, ownership, and explicit engineering context."
        action={
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Workspace</p>
            <p className="mt-1 font-semibold text-ink-900">{workspace.airline_name}</p>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard title="Total Alerts" value={formatNumber(summary.total_alerts)} description="All open and routed alerts in the workspace" icon={BellRing} />
        <KpiCard title="Open" value={formatNumber(summary.open_alerts)} description="Alerts requiring triage or action" icon={ShieldAlert} accent="danger" />
        <KpiCard title="In Review" value={formatNumber(summary.in_review_alerts)} description="Alerts currently under engineering review" icon={TimerReset} accent="warning" />
        <KpiCard title="Critical" value={formatNumber(summary.critical_alerts)} description="Severe alerts with immediate operational exposure" icon={OctagonAlert} accent="danger" />
        <KpiCard title="Avg Risk" value={summary.average_risk_score.toFixed(1)} description="Average risk score across active alert inventory" icon={Radar} accent="aqua" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="panel p-6">
          <h3 className="text-lg font-semibold text-ink-900">Alert queue</h3>
          <p className="mt-1 text-sm text-slate-600">Priority-ranked alerts generated from repeat defects, material shortages, flight disruption context, and connector failures.</p>
          <div className="mt-4">
            <DataTable data={alerts} columns={columns} rowKey={(row) => row.alert_id} initialSort={{ key: "risk_score", direction: "desc" }} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel p-6">
            <h3 className="text-lg font-semibold text-ink-900">Priority watchlists</h3>
            <div className="mt-4 space-y-3">
              {topAlerts.map((alert) => (
                <div key={alert.alert_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink-900">{alert.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{alert.aircraft_reference} · {alert.component} · {alert.station}</p>
                    </div>
                    <SeverityBadge severity={alert.severity as "Critical" | "High" | "Medium" | "Low"} />
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{alert.summary}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>{alert.owner}</span>
                    <span>{formatDateTime(alert.triggered_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-6">
            <h3 className="text-lg font-semibold text-ink-900">Operational event feed</h3>
            <p className="mt-1 text-sm text-slate-600">Normalized events feeding alert rules and case creation logic.</p>
            <div className="mt-4 space-y-3">
              {events.map((event) => (
                <div key={event.event_id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-ink-900">{event.title}</p>
                    <StatusBadge value={event.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span>{event.event_type}</span>
                    <span>·</span>
                    <span>{event.source_connector}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{formatDateTime(event.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
