"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, ArrowLeft, Gauge, Plane, TimerReset, Wrench } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartCard } from "@/components/chart-card";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { LoadingState } from "@/components/loading-state";
import { RiskBadge } from "@/components/risk-badge";
import { SeverityBadge } from "@/components/severity-badge";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { CHART_COLORS } from "@/lib/constants";
import type { AircraftDetail, DefectRecord, MaintenanceLogItem, RecurringComponentItem } from "@/lib/types";
import { formatDate, formatHours, formatNumber } from "@/lib/utils";

export default function AircraftDetailPage() {
  const params = useParams<{ id: string }>();
  const aircraftId = params.id;
  const [detail, setDetail] = useState<AircraftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getAircraftDetail(aircraftId);
        if (!active) return;
        setDetail(data);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load aircraft detail.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (aircraftId) {
      load();
    }

    return () => {
      active = false;
    };
  }, [aircraftId]);

  if (loading) {
    return <LoadingState title="Loading aircraft detail" description="Building the defect, maintenance, and recurrence view for the selected tail." />;
  }

  if (error || !detail) {
    return <EmptyState title="Aircraft detail unavailable" description={error || "The requested aircraft could not be loaded."} />;
  }

  const { summary, reliability_snapshot: snapshot } = detail;

  const defectColumns: DataTableColumn<DefectRecord>[] = [
    { key: "report_date", header: "Date", sortable: true, render: (row) => formatDate(row.report_date) },
    { key: "component", header: "Component", render: (row) => <div className="max-w-[220px]">{row.component}</div> },
    { key: "severity", header: "Severity", render: (row) => <SeverityBadge severity={row.severity} /> },
    { key: "risk_score", header: "Risk", sortable: true, render: (row) => <RiskBadge score={row.risk_score} />, align: "right" },
    { key: "status", header: "Status", render: (row) => <StatusBadge value={row.status} /> },
  ];

  const logColumns: DataTableColumn<MaintenanceLogItem>[] = [
    { key: "date", header: "Date", sortable: true, render: (row) => formatDate(row.date) },
    { key: "task_type", header: "Task" },
    { key: "component", header: "Component" },
    { key: "scheduled_unscheduled", header: "Category", render: (row) => <StatusBadge value={row.scheduled_unscheduled} /> },
    { key: "manhours", header: "MH", sortable: true, align: "right", render: (row) => formatHours(row.manhours) },
    { key: "outcome", header: "Outcome", render: (row) => <div className="max-w-[220px]">{row.outcome}</div> },
  ];

  const recurringColumns: DataTableColumn<RecurringComponentItem>[] = [
    { key: "component", header: "Component" },
    { key: "ata_chapter", header: "ATA" },
    { key: "occurrence_count", header: "Events", sortable: true, align: "right" },
    { key: "repeat_occurrences", header: "Repeat", sortable: true, align: "right" },
    { key: "average_risk_score", header: "Avg Risk", sortable: true, align: "right", render: (row) => <RiskBadge score={row.average_risk_score} /> },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Aircraft Detail"
        title={`${summary.tail_number} · ${summary.aircraft_type}`}
        description={`Base ${summary.base_station} · ${summary.fleet} · Current operational status: ${summary.status}`}
        action={
          <Button asChild variant="secondary">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
        }
      />

      <section className="panel overflow-hidden">
        <div className="grid gap-6 border-b border-slate-100 p-8 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge value={summary.status} />
              <span className="rounded-full bg-aqua/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink-900">
                {summary.aircraft_id}
              </span>
              <RiskBadge score={summary.current_risk_score} />
            </div>
            <h3 className="mt-5 text-3xl font-semibold text-ink-900">Reliability posture for {summary.tail_number}</h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              Combined view of current defect exposure, recurrence history, and maintenance activity to support fleet engineering review.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Flight Hours</p>
              <p className="mt-3 text-2xl font-semibold text-ink-900">{formatNumber(summary.flight_hours)}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Flight Cycles</p>
              <p className="mt-3 text-2xl font-semibold text-ink-900">{formatNumber(summary.flight_cycles)}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Age</p>
              <p className="mt-3 text-2xl font-semibold text-ink-900">{summary.age_years}y</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Open Defects</p>
              <p className="mt-3 text-2xl font-semibold text-ink-900">{summary.open_defects}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Current Risk" value={summary.current_risk_score.toFixed(1)} description="Weighted open + recent defect exposure" icon={Gauge} accent="danger" />
        <KpiCard title="AOG Events" value={String(snapshot.aog_events)} description="Historical AOG events for this aircraft" icon={Plane} accent="warning" />
        <KpiCard title="Repeat Defects" value={String(snapshot.repeat_defects)} description="Repeat defects within the recurrence window" icon={TimerReset} accent="warning" />
        <KpiCard title="Avg Rectification" value={formatHours(snapshot.average_rectification_hours)} description="Average repair effort across all aircraft defects" icon={Activity} accent="success" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ChartCard
          title="Defect trend for this aircraft"
          description="Monthly defect reporting history helps correlate event clusters and post-maintenance recurrence." 
          contentClassName="h-[320px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={detail.defect_trend}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fill: CHART_COLORS.secondary, fontSize: 12 }} />
              <YAxis tick={{ fill: CHART_COLORS.secondary, fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="defect_count" stroke={CHART_COLORS.primary} strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="aog_count" stroke={CHART_COLORS.accent} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="ATA distribution"
          description="System concentration view for identifying the aircraft-specific systems driving defect count and risk exposure."
          contentClassName="h-[320px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={detail.ata_distribution.slice(0, 8)} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fill: CHART_COLORS.secondary, fontSize: 12 }} />
              <YAxis dataKey="ata_chapter" type="category" width={130} tick={{ fill: CHART_COLORS.secondary, fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="defect_count" fill={CHART_COLORS.secondary} radius={[0, 10, 10, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <ChartCard
          title="Recent defects"
          description="Most recent aircraft defects with severity, risk, and status context for engineering review."
          contentClassName="pt-0"
        >
          <DataTable data={detail.recent_defects} columns={defectColumns} rowKey={(row) => row.defect_id} initialSort={{ key: "report_date", direction: "desc" }} />
        </ChartCard>

        <ChartCard
          title="Recurring components"
          description="Component recurrence summary highlights clusters that may require engineering action or deeper troubleshooting."
          contentClassName="pt-0"
        >
          <DataTable data={detail.recurring_components} columns={recurringColumns} rowKey={(row) => `${row.component}-${row.ata_chapter}`} initialSort={{ key: "repeat_occurrences", direction: "desc" }} />
        </ChartCard>
      </div>

      <ChartCard
        title="Maintenance logs"
        description="Recent maintenance activity recorded against this aircraft, including document references and execution outcome."
        contentClassName="pt-0"
      >
        <DataTable data={detail.maintenance_logs} columns={logColumns} rowKey={(row) => row.log_id} initialSort={{ key: "date", direction: "desc" }} />
      </ChartCard>
    </div>
  );
}
