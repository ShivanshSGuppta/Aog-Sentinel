"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Clock3, ListChecks, ShieldAlert, Siren } from "lucide-react";

import { useWorkspace } from "@/components/workspace-provider";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { LoadingState } from "@/components/loading-state";
import { SectionHeader } from "@/components/section-header";
import { SeverityBadge } from "@/components/severity-badge";
import { StatusBadge } from "@/components/status-badge";
import { api } from "@/lib/api";
import type { CaseDetail, CaseSummary } from "@/lib/types";
import { formatDateTime, formatNumber } from "@/lib/utils";

export default function CasesPage() {
  const { workspaceId, workspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const caseData = await api.getCases(workspaceId);
        if (!active) return;
        setCases(caseData);
        setSelectedCaseId((current) => current && caseData.some((item) => item.case_id === current) ? current : caseData[0]?.case_id || null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load case workflow inventory.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!selectedCaseId) return;
    const caseId = selectedCaseId;
    let active = true;

    async function loadDetail() {
      setDetailLoading(true);
      try {
        const detail = await api.getCaseDetail(caseId);
        if (!active) return;
        setSelectedCase(detail);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load case detail.");
      } finally {
        if (active) setDetailLoading(false);
      }
    }

    void loadDetail();
    return () => {
      active = false;
    };
  }, [selectedCaseId]);

  const overdueCount = useMemo(
    () => cases.filter((item) => new Date(item.sla_due).getTime() < Date.now() && item.status !== "Closed").length,
    [cases]
  );
  const escalatedCount = useMemo(() => cases.filter((item) => item.status === "Escalated").length, [cases]);
  const activeCount = useMemo(() => cases.filter((item) => item.status === "Active").length, [cases]);
  const monitoringCount = useMemo(() => cases.filter((item) => item.status === "Monitoring").length, [cases]);

  const columns: DataTableColumn<CaseSummary>[] = [
    {
      key: "title",
      header: "Case",
      sortable: true,
      render: (row) => (
        <button type="button" className="text-left" onClick={() => setSelectedCaseId(row.case_id)}>
          <div className="font-medium text-ink-900">{row.title}</div>
          <div className="text-xs text-slate-500">{row.aircraft_reference} · {row.category}</div>
        </button>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      sortable: true,
      render: (row) => <SeverityBadge severity={row.priority as "Critical" | "High" | "Medium" | "Low"} />,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => <StatusBadge value={row.status} />,
    },
    { key: "owner", header: "Owner", sortable: true },
    {
      key: "sla_due",
      header: "SLA due",
      sortable: true,
      render: (row) => <span className="text-xs text-slate-500">{formatDateTime(row.sla_due)}</span>,
    },
  ];

  if (workspaceLoading || loading) {
    return <LoadingState title="Loading case workflow board" description="Resolving escalation queues, SLA clocks, and engineering timeline state." />;
  }

  if (workspaceError || error || !workspace) {
    return <EmptyState title="Case workflow board unavailable" description={workspaceError || error || "Unable to load case workflow state."} />;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Cases"
        title="Operational cases from alert triage through engineering action"
        description="Cases track owners, SLA targets, escalations, and timeline entries across the airline engineering workflow."
        action={
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Workspace</p>
            <p className="mt-1 font-semibold text-ink-900">{workspace.airline_name}</p>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard title="Cases" value={formatNumber(cases.length)} description="All active case records in the workspace" icon={BriefcaseBusiness} />
        <KpiCard title="Escalated" value={formatNumber(escalatedCount)} description="Cases escalated beyond initial ownership" icon={Siren} accent="danger" />
        <KpiCard title="Active" value={formatNumber(activeCount)} description="Cases currently under investigation" icon={ListChecks} accent="warning" />
        <KpiCard title="Monitoring" value={formatNumber(monitoringCount)} description="Cases in watch or post-action monitoring state" icon={ShieldAlert} accent="aqua" />
        <KpiCard title="SLA Overdue" value={formatNumber(overdueCount)} description="Cases past due against current SLA target" icon={Clock3} accent="danger" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="panel p-6">
          <h3 className="text-lg font-semibold text-ink-900">Case board</h3>
          <p className="mt-1 text-sm text-slate-600">Select a case to inspect ownership, linked alerts, and chronological action history.</p>
          <div className="mt-4">
            <DataTable data={cases} columns={columns} rowKey={(row) => row.case_id} initialSort={{ key: "updated_at", direction: "desc" }} rowClassName={(row) => row.case_id === selectedCaseId ? "bg-aqua/10" : undefined} />
          </div>
        </div>

        <div className="panel p-6">
          {detailLoading ? <p className="text-sm text-slate-500">Loading case detail…</p> : null}
          {selectedCase ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Selected case</p>
                  <h3 className="mt-2 text-lg font-semibold text-ink-900">{selectedCase.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{selectedCase.aircraft_reference} · {selectedCase.category} · {selectedCase.owner}</p>
                </div>
                <StatusBadge value={selectedCase.status} />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Priority</p>
                  <p className="mt-1 font-medium text-ink-900">{selectedCase.priority}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Linked alerts</p>
                  <p className="mt-1 font-medium text-ink-900">{selectedCase.linked_alert_count}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Created</p>
                  <p className="mt-1 text-sm font-medium text-ink-900">{formatDateTime(selectedCase.created_at)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">SLA due</p>
                  <p className="mt-1 text-sm font-medium text-ink-900">{formatDateTime(selectedCase.sla_due)}</p>
                </div>
              </div>

              <div className="mt-6">
                <h4 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Timeline</h4>
                <div className="mt-4 space-y-4">
                  {selectedCase.timeline.map((entry) => (
                    <div key={entry.entry_id} className="relative rounded-2xl border border-slate-200 bg-white px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-ink-900">{entry.message}</p>
                          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                            <span>{entry.actor}</span>
                            <span>·</span>
                            <span>{entry.entry_type}</span>
                          </div>
                        </div>
                        <span className="text-xs text-slate-500">{formatDateTime(entry.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Select a case to inspect timeline detail.</p>
          )}
        </div>
      </div>
    </div>
  );
}
