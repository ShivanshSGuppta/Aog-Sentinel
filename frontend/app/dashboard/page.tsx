"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Plane,
  RotateCcw,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { api } from "@/lib/api";
import { CHART_COLORS } from "@/lib/constants";
import type {
  AircraftSummary,
  AtaBreakdownItem,
  AogIncident,
  DashboardSummary,
  MonthlyDefectItem,
  TopComponentItem,
  VendorIssueItem,
} from "@/lib/types";
import { formatHours, formatNumber } from "@/lib/utils";

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [ataBreakdown, setAtaBreakdown] = useState<AtaBreakdownItem[]>([]);
  const [monthlyDefects, setMonthlyDefects] = useState<MonthlyDefectItem[]>([]);
  const [topComponents, setTopComponents] = useState<TopComponentItem[]>([]);
  const [riskRanking, setRiskRanking] = useState<AircraftSummary[]>([]);
  const [vendors, setVendors] = useState<VendorIssueItem[]>([]);
  const [incidents, setIncidents] = useState<AogIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [summaryData, ataData, monthlyData, componentData, rankingData, vendorData, incidentData] = await Promise.all([
          api.getDashboardSummary(),
          api.getDashboardAtaBreakdown(),
          api.getDashboardMonthlyDefects(),
          api.getDashboardTopComponents(),
          api.getAircraftRiskRanking(),
          api.getReliabilityVendors(),
          api.getAogIncidents(),
        ]);

        if (!active) return;
        setSummary(summaryData);
        setAtaBreakdown(ataData);
        setMonthlyDefects(monthlyData);
        setTopComponents(componentData);
        setRiskRanking(rankingData);
        setVendors(vendorData.slice(0, 6));
        setIncidents(incidentData);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard data.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <LoadingState title="Loading fleet reliability dashboard" description="Correlating ATA trends, open defects, and current aircraft risk." />;
  }

  if (error || !summary) {
    return <EmptyState title="Dashboard unavailable" description={error || "Unable to load dashboard data from the API."} />;
  }

  const incidentColumns: DataTableColumn<AogIncident>[] = [
    {
      key: "aircraft",
      header: "Aircraft",
      sortable: true,
      sortAccessor: (row) => row.aircraft_label,
      render: (row) => (
        <Link href={`/aircraft/${row.aircraft_id}`} className="font-medium text-ink-900 hover:text-ink-700">
          {row.aircraft_label}
        </Link>
      ),
    },
    {
      key: "severity",
      header: "Severity",
      sortable: true,
      render: (row) => <SeverityBadge severity={row.severity} />,
    },
    {
      key: "risk_score",
      header: "Risk",
      sortable: true,
      render: (row) => <RiskBadge score={row.risk_score} />,
      align: "right",
    },
    {
      key: "component",
      header: "Component",
      render: (row) => <div className="max-w-[260px]">{row.component}</div>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge value={row.aog_flag ? "AOG" : row.status} />,
    },
  ];

  const rankingColumns: DataTableColumn<AircraftSummary>[] = [
    {
      key: "aircraft",
      header: "Aircraft",
      sortable: true,
      sortAccessor: (row) => row.current_risk_score,
      render: (row) => (
        <Link href={`/aircraft/${row.aircraft_id}`} className="font-medium text-ink-900 hover:text-ink-700">
          {row.tail_number}
          <span className="ml-2 text-xs text-slate-500">{row.aircraft_type}</span>
        </Link>
      ),
    },
    { key: "base_station", header: "Base", sortable: true },
    {
      key: "open_defects",
      header: "Open",
      sortable: true,
      align: "right",
      className: "font-medium text-ink-900",
    },
    {
      key: "current_risk_score",
      header: "Risk",
      sortable: true,
      align: "right",
      render: (row) => <RiskBadge score={row.current_risk_score} />,
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Operations Overview"
        title="Fleet reliability and dispatch exposure at a glance"
        description="Cross-functional engineering view of fleet defects, operational impact, ATA concentration, and the aircraft demanding immediate attention."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <KpiCard title="Total Aircraft" value={formatNumber(summary.total_aircraft)} description="Active aircraft across the monitored fleet" icon={Plane} />
        <KpiCard title="Open Defects" value={formatNumber(summary.open_defects)} description="Open, deferred, or in-work defects" icon={Wrench} accent="warning" />
        <KpiCard title="AOG Events" value={formatNumber(summary.aog_events)} description="Dispatch-impacting events tagged as AOG" icon={AlertTriangle} accent="danger" />
        <KpiCard title="Repeat Defects" value={formatNumber(summary.repeat_defects)} description="Defects flagged inside the 30-day recurrence rule" icon={RotateCcw} accent="warning" />
        <KpiCard title="Avg Rectification" value={formatHours(summary.avg_rectification_time)} description="Average closure effort for completed rectifications" icon={Clock3} accent="success" />
        <KpiCard title="Dispatch Impacting" value={formatNumber(summary.dispatch_impacting_events)} description="Events with AOG, severe delay, or severe open impact" icon={ShieldAlert} accent="danger" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <ChartCard
          title="Monthly defect trend"
          description="Fleet defect volume by reporting month, with AOG events highlighted against the overall defect trend."
          contentClassName="h-[320px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyDefects}>
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
          title="Defects by ATA chapter"
          description="ATA concentration helps engineering and reliability teams identify the systems dominating defect load."
          contentClassName="h-[320px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ataBreakdown.slice(0, 8)} layout="vertical" margin={{ left: 36 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fill: CHART_COLORS.secondary, fontSize: 12 }} />
              <YAxis dataKey="ata_chapter" type="category" width={120} tick={{ fill: CHART_COLORS.secondary, fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="defect_count" radius={[0, 10, 10, 0]}>
                {ataBreakdown.slice(0, 8).map((item) => (
                  <Cell key={item.ata_chapter} fill={item.average_risk_score >= 70 ? CHART_COLORS.danger : CHART_COLORS.primary} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ChartCard
          title="Top unreliable components"
          description="Components ranked by defect count and recurrence, useful for reliability review and engineering focus."
          contentClassName="h-[340px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topComponents.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fill: CHART_COLORS.secondary, fontSize: 12 }} />
              <YAxis dataKey="component" type="category" width={160} tick={{ fill: CHART_COLORS.secondary, fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="defect_count" fill={CHART_COLORS.secondary} radius={[0, 10, 10, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Vendor issue distribution"
          description="Optional vendor view for identifying supply quality patterns or concentrated issue clusters."
          contentClassName="h-[340px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={vendors}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis dataKey="vendor" tick={{ fill: CHART_COLORS.secondary, fontSize: 11 }} angle={-20} textAnchor="end" height={70} />
              <YAxis tick={{ fill: CHART_COLORS.secondary, fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="defect_count" fill={CHART_COLORS.accent} radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <ChartCard
          title="High-priority incidents"
          description="Current AOG and elevated-risk defects that should remain visible to maintenance control and engineering support."
          contentClassName="pt-0"
        >
          <DataTable
            data={incidents.slice(0, 8)}
            columns={incidentColumns}
            rowKey={(row) => row.defect_id}
            initialSort={{ key: "risk_score", direction: "desc" }}
            rowClassName={(row) => (row.severity === "Critical" ? "border-l-4 border-l-danger" : undefined)}
          />
        </ChartCard>

        <ChartCard
          title="Aircraft risk ranking"
          description="Aircraft-level rollup weighted toward open and recent defects for fast fleet prioritization."
          contentClassName="pt-0"
        >
          <DataTable
            data={riskRanking.slice(0, 8)}
            columns={rankingColumns}
            rowKey={(row) => row.aircraft_id}
            initialSort={{ key: "current_risk_score", direction: "desc" }}
          />
        </ChartCard>
      </div>
    </div>
  );
}
